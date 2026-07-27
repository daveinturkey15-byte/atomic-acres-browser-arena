import { readGlb } from './hunter-drone-glb.mjs';

export { readGlb };

export const REQUIRED_FIELD_KNIFE_ACTIONS = Object.freeze([
  'equip', 'unequip', 'idle', 'walk', 'sprint', 'melee', 'inspect',
]);
export const REQUIRED_FIELD_KNIFE_NODES = Object.freeze([
  'field-knife-blade', 'field-knife-fuller', 'field-knife-guard',
  'field-knife-full-tang', 'field-knife-g10-grip', 'field-knife-spine-serrations',
  'field-knife-pommel', 'field-knife-lanyard-hole',
  'grip-socket-r', 'blade-tip-socket', 'blade-edge-socket', 'pommel-socket',
]);

function triangles(json) {
  const instances = new Map();
  for (const node of json.nodes ?? []) if (typeof node.mesh === 'number') instances.set(node.mesh, (instances.get(node.mesh) ?? 0) + 1);
  return Math.round((json.meshes ?? []).reduce((total, mesh, meshIndex) => total + (mesh.primitives ?? []).reduce((subtotal, primitive) => {
    const accessor = primitive.indices ?? primitive.attributes?.POSITION;
    return subtotal + (json.accessors?.[accessor]?.count ?? 0) / 3 * (instances.get(meshIndex) ?? 0);
  }, 0), 0));
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
  return multiplyQuaternion(multiplyQuaternion(q, [v[0], v[1], v[2], 0]), [-q[0], -q[1], -q[2], q[3]]).slice(0, 3);
}

function worldPosition(json, index) {
  const parents = new Map();
  for (const [parentIndex, node] of (json.nodes ?? []).entries()) for (const child of node.children ?? []) parents.set(child, parentIndex);
  const resolve = (nodeIndex) => {
    const node = json.nodes?.[nodeIndex] ?? {};
    if (node.matrix) throw new Error('matrix-authored socket is unsupported');
    const local = { position: node.translation ?? [0, 0, 0], rotation: node.rotation ?? [0, 0, 0, 1], scale: node.scale ?? [1, 1, 1] };
    const parentIndex = parents.get(nodeIndex);
    if (parentIndex === undefined) return local;
    const parent = resolve(parentIndex);
    const offset = rotateVector(parent.rotation, local.position.map((value, axis) => value * parent.scale[axis]));
    return {
      position: parent.position.map((value, axis) => value + offset[axis]),
      rotation: multiplyQuaternion(parent.rotation, local.rotation),
      scale: parent.scale.map((value, axis) => value * local.scale[axis]),
    };
  };
  return resolve(index).position;
}

export function auditFieldKnifeGlb(json, variant, bytes) {
  const label = `field knife ${variant}`;
  const failures = [];
  const nodes = json.nodes ?? [];
  for (const name of REQUIRED_FIELD_KNIFE_NODES) {
    const matching = nodes.filter((node) => node.name === name);
    if (matching.length !== 1) failures.push(`${label}: ${name} must exist exactly once`);
  }
  for (const socket of REQUIRED_FIELD_KNIFE_NODES.filter((name) => name.endsWith('-socket') || name.includes('socket-'))) {
    const node = nodes.find((candidate) => candidate.name === socket);
    if (!node || typeof node.mesh === 'number') failures.push(`${label}: ${socket} must be an authored empty`);
  }
  const root = nodes.find((node) => node.extras?.asset_id === 'pass65-field-knife-v1');
  if (!root || root.extras?.delivery_variant !== variant || root.extras?.runtime_forward_axis !== '-Z'
    || root.extras?.presentation_only !== true || root.extras?.opaque_material_contract !== true) {
    failures.push(`${label}: release identity/delivery/axis metadata missing`);
  }
  const gripIndex = nodes.findIndex((node) => node.name === 'grip-socket-r');
  const tipIndex = nodes.findIndex((node) => node.name === 'blade-tip-socket');
  let bladeForwardDot = null;
  if (gripIndex >= 0 && tipIndex >= 0) {
    const grip = worldPosition(json, gripIndex);
    const tip = worldPosition(json, tipIndex);
    const direction = tip.map((value, axis) => value - grip[axis]);
    bladeForwardDot = -direction[2] / Math.hypot(...direction);
  }
  if (bladeForwardDot === null || bladeForwardDot < 0.88) failures.push(`${label}: grip-to-tip direction is not local -Z`);
  const animationNames = (json.animations ?? []).map((animation) => animation.name);
  for (const action of REQUIRED_FIELD_KNIFE_ACTIONS) if (!animationNames.includes(action)) failures.push(`${label}: missing action ${action}`);
  const pbr = (json.materials ?? []).filter((material) => material.name?.endsWith('_PBR'));
  if (pbr.length < 2) failures.push(`${label}: blade and G10 PBR materials required`);
  for (const material of pbr) if (!material.pbrMetallicRoughness?.baseColorTexture
    || !material.pbrMetallicRoughness?.metallicRoughnessTexture || !material.normalTexture) {
    failures.push(`${label}: ${material.name} has incomplete PBR bindings`);
  }
  const normalMapped = new Set((json.materials ?? []).flatMap((material, index) => material.normalTexture ? [index] : []));
  const primitives = (json.meshes ?? []).flatMap((mesh) => mesh.primitives ?? []).filter((primitive) => normalMapped.has(primitive.material));
  if (primitives.length === 0 || primitives.some((primitive) => primitive.attributes?.TEXCOORD_0 === undefined || primitive.attributes?.TANGENT === undefined)) {
    failures.push(`${label}: normal-mapped PBR primitives require UVs and tangents`);
  }
  for (const extension of ['EXT_meshopt_compression', 'KHR_mesh_quantization', 'EXT_texture_webp']) {
    if (!(json.extensionsUsed ?? []).includes(extension)) failures.push(`${label}: optimized extension ${extension} missing`);
  }
  if ([...(json.images ?? []), ...(json.buffers ?? [])].some((entry) => typeof entry.uri === 'string')) failures.push(`${label}: external URI forbidden`);
  if ((json.materials ?? []).some((material) => (material.alphaMode ?? 'OPAQUE') !== 'OPAQUE')) failures.push(`${label}: transparent material forbidden`);
  const triangleCount = triangles(json);
  if (triangleCount < 350 || triangleCount > 18_000) failures.push(`${label}: ${triangleCount} triangles outside 350-18000`);
  if (bytes < 75_000 || bytes > 2_500_000) failures.push(`${label}: ${bytes} bytes outside optimized budget`);
  return Object.freeze({
    failures: Object.freeze(failures), triangles: triangleCount, bytes,
    meshNodes: nodes.filter((node) => typeof node.mesh === 'number').length,
    materials: (json.materials ?? []).length, images: (json.images ?? []).length,
    animations: Object.freeze(animationNames), bladeForwardDot,
    externalUris: [...(json.images ?? []), ...(json.buffers ?? [])].filter((entry) => typeof entry.uri === 'string').length,
  });
}
