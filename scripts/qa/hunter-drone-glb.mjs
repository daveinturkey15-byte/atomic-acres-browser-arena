import { readFile } from 'node:fs/promises';

export const REQUIRED_DRONE_NODES = Object.freeze([
  'drone-body',
  'drone-optic',
  'drone-mounted-gun',
  'drone-gun-muzzle-socket',
  'drone-first-person-camera-socket',
  'drone-rotors',
  'drone-rotor-1',
  'drone-rotor-2',
  'drone-rotor-3',
  'drone-rotor-4',
]);

export const REQUIRED_DRONE_ANIMATIONS = Object.freeze([
  'Drone_Propellers_Loop',
  'Drone_Gun_Fire',
  'Drone_Gun_Recoil',
]);

export async function readGlb(file) {
  const bytes = await readFile(file);
  if (bytes.length < 20 || bytes.toString('ascii', 0, 4) !== 'glTF') throw new Error(`${file}: invalid GLB magic`);
  if (bytes.readUInt32LE(4) !== 2) throw new Error(`${file}: GLB version must be 2`);
  if (bytes.readUInt32LE(8) !== bytes.length) throw new Error(`${file}: GLB byte length header mismatch`);
  let offset = 12;
  let json = null;
  let binary = null;
  while (offset + 8 <= bytes.length) {
    const length = bytes.readUInt32LE(offset);
    const type = bytes.readUInt32LE(offset + 4);
    const start = offset + 8;
    const end = start + length;
    if (end > bytes.length) throw new Error(`${file}: GLB chunk exceeds file length`);
    if (type === 0x4e4f534a) json = JSON.parse(bytes.toString('utf8', start, end).replace(/[\0 ]+$/u, ''));
    if (type === 0x004e4942) binary = bytes.subarray(start, end);
    offset = end;
  }
  if (!json) throw new Error(`${file}: GLB JSON chunk missing`);
  return { bytes, json, binary };
}

function descendantMeshCount(json, rootIndex) {
  const visited = new Set();
  const visit = (index) => {
    if (visited.has(index)) return 0;
    visited.add(index);
    const node = json.nodes?.[index];
    if (!node) return 0;
    return (typeof node.mesh === 'number' ? 1 : 0)
      + (node.children ?? []).reduce((total, child) => total + visit(child), 0);
  };
  return visit(rootIndex);
}

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
      const count = json.accessors?.[accessorIndex]?.count ?? 0;
      triangles += count / 3 * (instances.get(meshIndex) ?? 0);
    }
  }
  return triangles;
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

function animationDuration(json, animation) {
  let duration = 0;
  for (const sampler of animation.samplers ?? []) {
    const input = json.accessors?.[sampler.input];
    if (Array.isArray(input?.max)) duration = Math.max(duration, input.max[0] ?? 0);
  }
  return duration;
}

export function auditDroneGlb(json, lod, bytes) {
  const failures = [];
  const nodes = json.nodes ?? [];
  const nodeIndex = new Map(nodes.map((node, index) => [node.name, index]));
  for (const name of REQUIRED_DRONE_NODES) if (!nodeIndex.has(name)) failures.push(`LOD${lod}: missing authored node ${name}`);

  const root = nodes.find((node) => node.name === `HunterDrone_LOD${lod}`);
  if (root?.extras?.runtime_forward_axis !== '-Z') failures.push(`LOD${lod}: root does not declare runtime -Z forward`);
  if (root?.extras?.asset_id !== 'hunter-drone-visual-family-v1') failures.push(`LOD${lod}: wrong shared visual family id`);

  for (const socket of ['drone-first-person-camera-socket', 'drone-gun-muzzle-socket']) {
    const index = nodeIndex.get(socket);
    const node = nodes[index];
    if (!node || typeof node.mesh === 'number') failures.push(`LOD${lod}: ${socket} must be an authored empty socket`);
    const position = index === undefined ? null : nodeWorldTranslation(json, index);
    if (!position || position[2] >= -0.75) {
      failures.push(`LOD${lod}: ${socket} is not forward on local -Z`);
    }
  }

  for (const [name, minimumMeshes] of [['drone-body', 5], ['drone-mounted-gun', 4], ['drone-rotors', 16]]) {
    const index = nodeIndex.get(name);
    if (index === undefined || descendantMeshCount(json, index) < minimumMeshes) {
      failures.push(`LOD${lod}: ${name} lacks its authored machine silhouette`);
    }
  }

  const animationByName = new Map((json.animations ?? []).map((animation) => [animation.name, animation]));
  for (const name of REQUIRED_DRONE_ANIMATIONS) {
    const animation = animationByName.get(name);
    if (!animation) failures.push(`LOD${lod}: missing animation clip ${name}`);
    else if ((animation.channels?.length ?? 0) < (name === 'Drone_Propellers_Loop' ? 4 : 1)) {
      failures.push(`LOD${lod}: ${name} has insufficient authored channels`);
    } else if (animationDuration(json, animation) <= 0.03) failures.push(`LOD${lod}: ${name} has no useful duration`);
  }

  const armor = (json.materials ?? []).find((material) => material.name === 'MAT_HunterDrone_Armor_PBR');
  if (!armor?.pbrMetallicRoughness?.baseColorTexture) failures.push(`LOD${lod}: armor albedo binding missing`);
  if (!armor?.normalTexture) failures.push(`LOD${lod}: armor normal binding missing`);
  if (!armor?.pbrMetallicRoughness?.metallicRoughnessTexture) failures.push(`LOD${lod}: armor ORM metallic/roughness binding missing`);
  if (!armor?.occlusionTexture) failures.push(`LOD${lod}: armor ORM occlusion binding missing`);
  if (!armor?.emissiveTexture) failures.push(`LOD${lod}: armor emissive binding missing`);
  if ((json.images ?? []).length < 4 || (json.textures ?? []).length < 4) failures.push(`LOD${lod}: complete embedded PBR image set missing`);
  if ((json.images ?? []).some((image) => typeof image.uri === 'string')) failures.push(`LOD${lod}: external image URI is forbidden`);
  if ((json.buffers ?? []).some((buffer) => typeof buffer.uri === 'string')) failures.push(`LOD${lod}: external buffer URI is forbidden`);

  const primitives = (json.meshes ?? []).flatMap((mesh) => mesh.primitives ?? []);
  if (!primitives.some((primitive) => primitive.attributes?.TEXCOORD_0 !== undefined && primitive.attributes?.TANGENT !== undefined)) {
    failures.push(`LOD${lod}: no authored UV+tangent PBR primitive`);
  }

  for (const extension of ['EXT_meshopt_compression', 'KHR_mesh_quantization', 'EXT_texture_webp']) {
    if (!(json.extensionsUsed ?? []).includes(extension)) failures.push(`LOD${lod}: optimized extension ${extension} missing`);
  }

  const triangles = primitiveTriangles(json);
  const [minimumTriangles, maximumTriangles] = [[9_000, 12_000], [6_500, 9_000], [4_000, 6_500]][lod];
  if (triangles < minimumTriangles || triangles > maximumTriangles) {
    failures.push(`LOD${lod}: ${triangles} triangles outside ${minimumTriangles}-${maximumTriangles}`);
  }
  if (bytes < 75_000 || bytes > 2_500_000) failures.push(`LOD${lod}: ${bytes} bytes outside optimized asset budget`);

  return Object.freeze({
    failures: Object.freeze(failures),
    triangles,
    bytes,
    meshNodes: nodes.filter((node) => typeof node.mesh === 'number').length,
    materials: (json.materials ?? []).length,
    images: (json.images ?? []).length,
    animations: Object.freeze((json.animations ?? []).map((animation) => animation.name)),
    externalUris: (json.images ?? []).filter((image) => image.uri).length + (json.buffers ?? []).filter((buffer) => buffer.uri).length,
  });
}

export function pngDimensions(bytes) {
  if (bytes.length < 24 || bytes.toString('ascii', 1, 4) !== 'PNG') throw new Error('invalid PNG');
  return Object.freeze({ width: bytes.readUInt32BE(16), height: bytes.readUInt32BE(20) });
}
