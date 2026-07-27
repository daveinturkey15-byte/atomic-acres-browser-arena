import { createHash } from 'node:crypto';
import { MeshoptDecoder } from 'meshoptimizer';
import { readGlb } from './hunter-drone-glb.mjs';
import { REQUIRED_CORE_ACTIONS } from './pass65-crossbow-arms-glb.mjs';

export { readGlb, REQUIRED_CORE_ACTIONS };

await MeshoptDecoder.ready;

export const REQUIRED_WEAPON_SOCKETS = Object.freeze([
  'grip-socket-r', 'support-socket-l', 'reload-socket-l',
  'magazine-socket', 'muzzle-socket', 'eject-socket', 'optic-socket',
  'rear-sight-socket', 'front-sight-socket',
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

function runtimePrimitiveCount(json) {
  const instances = new Map();
  for (const node of json.nodes ?? []) {
    if (typeof node.mesh === 'number') instances.set(node.mesh, (instances.get(node.mesh) ?? 0) + 1);
  }
  return (json.meshes ?? []).reduce((total, mesh, meshIndex) => (
    total + (mesh.primitives?.length ?? 0) * (instances.get(meshIndex) ?? 0)
  ), 0);
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
  const cache = new Map();
  const resolve = (nodeIndex) => {
    if (cache.has(nodeIndex)) return cache.get(nodeIndex);
    const node = json.nodes?.[nodeIndex] ?? {};
    if (node.matrix) throw new Error(`matrix-authored node ${node.name ?? nodeIndex} is unsupported by the axis audit`);
    const localPosition = node.translation ?? [0, 0, 0];
    const localRotation = node.rotation ?? [0, 0, 0, 1];
    const localScale = node.scale ?? [1, 1, 1];
    const parentIndex = parents.get(nodeIndex);
    const value = parentIndex === undefined
      ? { position: localPosition, rotation: localRotation, scale: localScale }
      : (() => {
          const parent = resolve(parentIndex);
          const scaled = localPosition.map((component, axis) => component * parent.scale[axis]);
          const rotated = rotateVector(parent.rotation, scaled);
          return {
            position: parent.position.map((component, axis) => component + rotated[axis]),
            rotation: multiplyQuaternion(parent.rotation, localRotation),
            scale: parent.scale.map((component, axis) => component * localScale[axis]),
          };
        })();
    cache.set(nodeIndex, value);
    return value;
  };
  return resolve(index).position;
}

function animationSignature(json, binary) {
  let complete = Boolean(binary);
  const decodedViews = new Map();
  const decodedView = (viewIndex) => {
    if (decodedViews.has(viewIndex)) return decodedViews.get(viewIndex);
    const view = json.bufferViews?.[viewIndex];
    if (!binary || !view) return null;
    const compression = view.extensions?.EXT_meshopt_compression;
    if (!compression) {
      if ((view.buffer ?? 0) !== 0) return null;
      const start = Number(view.byteOffset ?? 0);
      const end = start + Number(view.byteLength ?? 0);
      if (start < 0 || end > binary.length) return null;
      const value = { bytes: binary.subarray(start, end), stride: Number(view.byteStride ?? 0) };
      decodedViews.set(viewIndex, value);
      return value;
    }
    if ((compression.buffer ?? 0) !== 0) return null;
    const compressedStart = Number(compression.byteOffset ?? 0);
    const compressedEnd = compressedStart + Number(compression.byteLength ?? 0);
    const count = Number(compression.count ?? 0);
    const stride = Number(compression.byteStride ?? 0);
    if (compressedStart < 0 || compressedEnd > binary.length || count <= 0 || stride <= 0) return null;
    const bytes = new Uint8Array(count * stride);
    MeshoptDecoder.decodeGltfBuffer(
      bytes,
      count,
      stride,
      binary.subarray(compressedStart, compressedEnd),
      compression.mode,
      compression.filter,
    );
    const value = { bytes, stride: Number(view.byteStride ?? stride) };
    decodedViews.set(viewIndex, value);
    return value;
  };
  const digestAccessor = (accessorIndex) => {
    const accessor = json.accessors?.[accessorIndex];
    const view = json.bufferViews?.[accessor?.bufferView];
    const componentBytes = new Map([[5120, 1], [5121, 1], [5122, 2], [5123, 2], [5125, 4], [5126, 4]]);
    const typeComponents = new Map([['SCALAR', 1], ['VEC2', 2], ['VEC3', 3], ['VEC4', 4], ['MAT2', 4], ['MAT3', 9], ['MAT4', 16]]);
    const packedStride = (componentBytes.get(accessor?.componentType) ?? 0) * (typeComponents.get(accessor?.type) ?? 0);
    const decoded = decodedView(accessor?.bufferView);
    if (!accessor || !view || !decoded || packedStride <= 0) {
      complete = false;
      return null;
    }
    const start = Number(accessor.byteOffset ?? 0);
    const stride = Number(decoded.stride || packedStride);
    const end = start + Math.max(0, accessor.count - 1) * stride + packedStride;
    if (start < 0 || stride < packedStride || end > decoded.bytes.length) {
      complete = false;
      return null;
    }
    const hash = createHash('sha256');
    for (let index = 0; index < accessor.count; index += 1) {
      const elementStart = start + index * stride;
      hash.update(decoded.bytes.subarray(elementStart, elementStart + packedStride));
    }
    return hash.digest('hex');
  };
  const signature = JSON.stringify((json.animations ?? []).map((animation) => ({
    name: animation.name,
    channels: animation.channels?.length ?? 0,
    targets: (animation.channels ?? []).map((channel) => ({
      node: channel.target?.node ?? null,
      path: channel.target?.path ?? null,
    })),
    outputs: (animation.samplers ?? []).map((sampler) => {
      const accessor = json.accessors?.[sampler.output] ?? {};
      return {
        count: accessor.count ?? 0,
        type: accessor.type ?? null,
        componentType: accessor.componentType ?? null,
        payloadSha256: digestAccessor(sampler.output),
      };
    }),
  })));
  return { complete, signature };
}

function forwardDot(json, fromName, toName) {
  const fromIndex = (json.nodes ?? []).findIndex((node) => node.name === fromName);
  const toIndex = (json.nodes ?? []).findIndex((node) => node.name === toName);
  if (fromIndex < 0 || toIndex < 0) return null;
  const from = nodeWorldTranslation(json, fromIndex);
  const to = nodeWorldTranslation(json, toIndex);
  const direction = to.map((component, axis) => component - from[axis]);
  const length = Math.hypot(...direction);
  return length > 1e-6 ? -direction[2] / length : null;
}

export function auditWeaponFamilyGlb(json, spec, delivery, bytes, binary) {
  const label = `${spec.id} ${delivery.variant}`;
  const failures = [];
  const nodes = json.nodes ?? [];
  const names = nodes.map((node) => node.name ?? '');
  const externalUris = [...(json.images ?? []), ...(json.buffers ?? [])]
    .filter((entry) => typeof entry.uri === 'string').length;
  if (externalUris > 0) failures.push(`${label}: external image or buffer URIs are forbidden`);
  for (const extension of ['EXT_meshopt_compression', 'KHR_mesh_quantization', 'EXT_texture_webp']) {
    if (!(json.extensionsUsed ?? []).includes(extension)) failures.push(`${label}: optimized extension ${extension} missing`);
  }
  for (const material of json.materials ?? []) {
    if ((material.alphaMode ?? 'OPAQUE') !== 'OPAQUE') failures.push(`${label}: material ${material.name ?? '<unnamed>'} is not opaque`);
  }
  const root = nodes.find((node) => node.extras?.asset_id === `pass65-weapon-${spec.id}`);
  if (!root) failures.push(`${label}: production asset identity missing`);
  if (root?.extras?.weapon_id !== spec.id || root?.extras?.display_name !== spec.displayName
    || root?.extras?.design_id !== spec.designId || root?.extras?.silhouette_family !== spec.family) {
    failures.push(`${label}: canonical identity metadata mismatch`);
  }
  if (root?.extras?.delivery_variant !== delivery.variant || root?.extras?.runtime_forward_axis !== '-Z') {
    failures.push(`${label}: delivery/axis metadata mismatch`);
  }
  if (root?.extras?.source_spec_schema !== 1 || root?.extras?.presentation_only !== true
    || root?.extras?.opaque_material_contract !== true) {
    failures.push(`${label}: source and gameplay-boundary metadata incomplete`);
  }
  const expectedVisualRevision = spec.id === 'm4a1' ? 'm4a1-production-hero-v3' : 'platform-production-hero-v4';
  const expectedMaterialLanguage = spec.id === 'm4a1' ? 'm4a1-anodized-metal-polymer-pbr-v3' : 'platform-authentic-metal-polymer-pbr-v4';
  if (root?.extras?.visual_revision !== expectedVisualRevision
    || root?.extras?.material_language !== expectedMaterialLanguage
    || root?.extras?.delivery_silhouette_review !== true) {
    failures.push(`${label}: platform-specific silhouette/material review contract missing`);
  }
  for (const required of spec.signatureNodes) {
    const matching = nodes.filter((node) => node.name === required);
    if (matching.length !== 1) failures.push(`${label}: ${required} must exist exactly once`);
  }
  for (const socketName of REQUIRED_WEAPON_SOCKETS) {
    const matching = nodes.filter((node) => node.name === socketName);
    if (matching.length !== 1 || typeof matching[0]?.mesh === 'number') {
      failures.push(`${label}: ${socketName} must be exactly one authored empty`);
    }
  }
  const muzzleForwardDot = forwardDot(json, 'grip-socket-r', 'muzzle-socket');
  const sightForwardDot = forwardDot(json, 'rear-sight-socket', 'front-sight-socket');
  if (muzzleForwardDot === null || muzzleForwardDot < 0.88) failures.push(`${label}: grip-to-muzzle direction is not local -Z`);
  if (sightForwardDot === null || sightForwardDot < 0.88) failures.push(`${label}: rear-to-front sight direction is not local -Z`);
  const animationNames = (json.animations ?? []).map((animation) => animation.name);
  for (const action of REQUIRED_CORE_ACTIONS) if (!animationNames.includes(action)) failures.push(`${label}: missing action ${action}`);
  const authoredAnimation = animationSignature(json, binary);
  if (!authoredAnimation.complete) failures.push(`${label}: animation payload bytes are unavailable for motion verification`);
  const pbrMaterials = (json.materials ?? []).filter((material) => material.name?.endsWith('_PBR'));
  if (pbrMaterials.length < 2) failures.push(`${label}: two independent normal-mapped PBR materials are required`);
  for (const material of pbrMaterials) {
    if (!material.pbrMetallicRoughness?.baseColorTexture
      || !material.pbrMetallicRoughness?.metallicRoughnessTexture
      || !material.normalTexture) failures.push(`${label}: ${material.name} has incomplete embedded PBR bindings`);
  }
  const textureImageSource = (textureIndex) => {
    const texture = json.textures?.[textureIndex];
    return texture?.extensions?.EXT_texture_webp?.source ?? texture?.source;
  };
  const baseColorImageSources = new Set(pbrMaterials.map((material) => (
    textureImageSource(material.pbrMetallicRoughness?.baseColorTexture?.index)
  )));
  const metallicRoughnessImageSources = new Set(pbrMaterials.map((material) => (
    textureImageSource(material.pbrMetallicRoughness?.metallicRoughnessTexture?.index)
  )));
  if (baseColorImageSources.size < 2 || metallicRoughnessImageSources.size < 2) {
    failures.push(`${label}: metal and polymer PBR channels must use distinct authored texture sets`);
  }
  const normalMappedMaterialIndices = new Set((json.materials ?? []).flatMap((material, index) => material.normalTexture ? [index] : []));
  const pbrPrimitives = (json.meshes ?? []).flatMap((mesh) => mesh.primitives ?? [])
    .filter((primitive) => normalMappedMaterialIndices.has(primitive.material));
  if (pbrPrimitives.length === 0) failures.push(`${label}: no normal-mapped PBR primitive`);
  if (pbrPrimitives.some((primitive) => primitive.attributes?.TEXCOORD_0 === undefined || primitive.attributes?.TANGENT === undefined)) {
    failures.push(`${label}: normal-mapped PBR primitive lacks UVs or tangents`);
  }
  if ((json.images ?? []).length < 3) failures.push(`${label}: embedded PBR image set incomplete`);
  const triangles = primitiveTriangles(json);
  const minimumTriangles = delivery.detail >= 0.9 ? 1_200 : delivery.detail >= 0.65 ? 900 : delivery.detail >= 0.4 ? 600 : 350;
  if (triangles < minimumTriangles || triangles > 35_000) {
    failures.push(`${label}: ${triangles} triangles outside ${minimumTriangles}-35000 delivery budget`);
  }
  if (bytes < 80_000 || bytes > 2_500_000) failures.push(`${label}: ${bytes} bytes outside optimized asset budget`);
  const meshNodes = nodes.filter((node) => typeof node.mesh === 'number').length;
  const renderPrimitives = runtimePrimitiveCount(json);
  const minimumMeshNodes = 4;
  if (meshNodes < minimumMeshNodes) failures.push(`${label}: only ${meshNodes} visible authored parts; silhouette corpus is incomplete`);
  const maximumPrimitives = delivery.variant === 'drop-lod0' ? 12 : 16;
  if (renderPrimitives > maximumPrimitives) {
    failures.push(`${label}: ${renderPrimitives} runtime render primitives exceed ${maximumPrimitives}`);
  }
  const declaredBudget = Number(root?.extras?.runtime_render_primitive_budget ?? 0);
  if (declaredBudget !== maximumPrimitives) failures.push(`${label}: runtime primitive budget metadata is not ${maximumPrimitives}`);
  if (root?.extras?.runtime_batching_contract !== 'static-action-magazine-by-material-v1') {
    failures.push(`${label}: rigid material batching contract missing`);
  }
  if (spec.id !== 'm4a1' && typeof root?.extras?.platform_anatomy !== 'string') {
    failures.push(`${label}: platform-specific production anatomy receipt missing`);
  }
  const declaredLength = Number(root?.extras?.declared_length_m ?? 0);
  if (Math.abs(declaredLength - spec.length) > 0.0001) failures.push(`${label}: declared length does not match source specification`);
  return Object.freeze({
    failures: Object.freeze(failures), triangles, bytes, meshNodes, renderPrimitives,
    materials: (json.materials ?? []).length, images: (json.images ?? []).length,
    animations: Object.freeze(animationNames), animationSignature: authoredAnimation.signature,
    externalUris, muzzleForwardDot, sightForwardDot, declaredLength,
    platformAnatomy: root?.extras?.platform_anatomy ?? root?.extras?.m4a1_platform_anatomy,
    silhouetteSignature: JSON.stringify({
      designId: root?.extras?.design_id, family: root?.extras?.silhouette_family,
      triangles, meshNodes, declaredLength,
      platformAnatomy: root?.extras?.platform_anatomy ?? root?.extras?.m4a1_platform_anatomy,
      signatures: spec.signatureNodes.map((name) => names.indexOf(name)),
    }),
  });
}
