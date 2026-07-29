import { pngDimensions, readGlb } from './hunter-drone-glb.mjs';

export { pngDimensions, readGlb };

export const SUPPORT_VEHICLE_SPECS = Object.freeze({
  chopper: Object.freeze({
    assetId: 'chopper-gunner-vehicle-v1',
    root: (lod) => `Pass65Chopper_LOD${lod}`,
    variant: null,
    material: 'MAT_Pass65Chopper_Armor_PBR',
    nodes: Object.freeze([
      'chopper-fuselage', 'chopper-rear-fuselage', 'chopper-tail-boom', 'chopper-tail-fin',
      'chopper-sleek-cockpit-canopy', 'chopper-first-person-cockpit', 'chopper-gunner-sightline',
      'chopper-gunner-weapon-view',
      'chopper-cockpit-dashboard-3d', 'chopper-cockpit-display-cyan', 'chopper-cockpit-display-green',
      'chopper-cockpit-hud-glass', 'chopper-cockpit-hud-target-ring',
      'chopper-first-person-camera-socket', 'chopper-main-rotor', 'chopper-tail-rotor',
      'chopper-player-gun', 'chopper-gun-muzzle-socket',
      'chopper-forward-socket', 'chopper-muzzle-flash', 'chopper-tracer-action', 'chopper-impact-action',
    ]),
    sockets: Object.freeze(['chopper-first-person-camera-socket', 'chopper-gun-muzzle-socket', 'chopper-forward-socket']),
    forwardSockets: Object.freeze(['chopper-gun-muzzle-socket', 'chopper-forward-socket']),
    actions: Object.freeze([
      'Chopper_Main_Rotor_Loop', 'Chopper_Tail_Rotor_Loop',
      'Chopper_Gun_Recoil', 'Chopper_Gun_Fire', 'Chopper_Muzzle_Flash',
      'Chopper_Tracer_Pulse', 'Chopper_Impact_Pulse', 'Chopper_Quiet_Loop',
    ]),
    minimumAnimationChannels: Object.freeze({
      Chopper_Main_Rotor_Loop: 1,
      Chopper_Tail_Rotor_Loop: 1,
    }),
    minimumMeshNodes: Object.freeze({
      'chopper-fuselage': 5,
      'chopper-rear-fuselage': 5,
      'chopper-first-person-cockpit': 18,
      'chopper-gunner-sightline': 8,
      'chopper-gunner-weapon-view': 3,
      'chopper-player-gun': 5,
    }),
  }),
  care: Object.freeze({
    assetId: 'support-aircraft-family-v1',
    root: (lod) => `Pass65CareAircraft_LOD${lod}`,
    variant: 'care',
    material: 'MAT_Pass65SupportAircraft_Armor_PBR',
    nodes: Object.freeze([
      'care-aircraft-fuselage', 'care-aircraft-nose', 'care-aircraft-main-wing',
      'care-aircraft-cargo-bay', 'care-aircraft-cargo-door', 'care-aircraft-cargo-socket',
      'care-aircraft-forward-socket', 'care-aircraft-propeller-0', 'care-aircraft-propeller-1',
      'care-aircraft-propeller-2', 'care-aircraft-propeller-3',
    ]),
    sockets: Object.freeze(['care-aircraft-cargo-socket', 'care-aircraft-forward-socket']),
    forwardSockets: Object.freeze(['care-aircraft-forward-socket']),
    actions: Object.freeze(['Care_Aircraft_Propellers_Loop', 'Care_Cargo_Door_Open', 'Care_Cargo_Drop_Pulse', 'Care_Aircraft_Quiet_Loop']),
    minimumAnimationChannels: Object.freeze({ Care_Aircraft_Propellers_Loop: 4 }),
    minimumMeshNodes: Object.freeze({ 'care-aircraft-fuselage': 1, 'care-aircraft-main-wing': 2 }),
  }),
  carpet: Object.freeze({
    assetId: 'support-aircraft-family-v1',
    root: (lod) => `Pass65CarpetAircraft_LOD${lod}`,
    variant: 'carpet',
    material: 'MAT_Pass65SupportAircraft_Carpet_PBR',
    nodes: Object.freeze([
      'carpet-aircraft-fuselage', 'carpet-aircraft-nose', 'carpet-aircraft-main-wing',
      'carpet-aircraft-bomb-bay', 'carpet-aircraft-bomb-door-left', 'carpet-aircraft-bomb-door-right',
      'carpet-aircraft-bomb-rack', 'carpet-aircraft-bomb-socket', 'carpet-aircraft-forward-socket',
      'carpet-aircraft-fan-0', 'carpet-aircraft-fan-1', 'carpet-aircraft-fan-2', 'carpet-aircraft-fan-3',
    ]),
    sockets: Object.freeze(['carpet-aircraft-bomb-socket', 'carpet-aircraft-forward-socket']),
    forwardSockets: Object.freeze(['carpet-aircraft-forward-socket']),
    actions: Object.freeze(['Carpet_Aircraft_Engine_Loop', 'Carpet_Bomb_Bay_Open', 'Carpet_Bomb_Rack_Pulse', 'Carpet_Aircraft_Quiet_Loop']),
    minimumAnimationChannels: Object.freeze({ Carpet_Aircraft_Engine_Loop: 4, Carpet_Bomb_Bay_Open: 2 }),
    minimumMeshNodes: Object.freeze({ 'carpet-aircraft-fuselage': 1, 'carpet-aircraft-main-wing': 2 }),
  }),
  crate: Object.freeze({
    assetId: 'support-aircraft-family-v1',
    root: (lod) => `Pass65CareCrate_LOD${lod}`,
    variant: 'parachute-crate',
    material: 'MAT_Pass65SupportAircraft_Crate_PBR',
    nodes: Object.freeze([
      'care-package-crate', 'care-package-straps', 'care-package-parachute',
      'care-parachute-lines', 'care-crate-landing-socket',
    ]),
    sockets: Object.freeze(['care-crate-landing-socket']),
    forwardSockets: Object.freeze([]),
    actions: Object.freeze(['Care_Parachute_Sway_Loop', 'Care_Parachute_Lines_Loop', 'Care_Parachute_Collapse']),
    minimumAnimationChannels: Object.freeze({}),
    minimumMeshNodes: Object.freeze({ 'care-package-crate': 1, 'care-package-parachute': 1, 'care-parachute-lines': 8 }),
  }),
});

function descendantMeshCount(json, rootIndex) {
  const visited = new Set();
  const visit = (index) => {
    if (visited.has(index)) return 0;
    visited.add(index);
    const node = json.nodes?.[index];
    if (!node) return 0;
    return (typeof node.mesh === 'number' ? 1 : 0) + (node.children ?? []).reduce((sum, child) => sum + visit(child), 0);
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
      triangles += ((json.accessors?.[accessorIndex]?.count ?? 0) / 3) * (instances.get(meshIndex) ?? 0);
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

function rotateVector(q, vector) {
  return multiplyQuaternion(multiplyQuaternion(q, [...vector, 0]), [-q[0], -q[1], -q[2], q[3]]).slice(0, 3);
}

function nodeWorldTranslation(json, index) {
  const parents = new Map();
  for (const [parentIndex, node] of (json.nodes ?? []).entries()) {
    for (const child of node.children ?? []) parents.set(child, parentIndex);
  }
  const resolve = (nodeIndex) => {
    const node = json.nodes?.[nodeIndex] ?? {};
    if (node.matrix) throw new Error(`matrix-authored node ${node.name ?? nodeIndex} is unsupported by the axis audit`);
    const position = node.translation ?? [0, 0, 0];
    const rotation = node.rotation ?? [0, 0, 0, 1];
    const scale = node.scale ?? [1, 1, 1];
    const parentIndex = parents.get(nodeIndex);
    if (parentIndex === undefined) return { position, rotation, scale };
    const parent = resolve(parentIndex);
    const rotated = rotateVector(parent.rotation, position.map((value, axis) => value * parent.scale[axis]));
    return {
      position: parent.position.map((value, axis) => value + rotated[axis]),
      rotation: multiplyQuaternion(parent.rotation, rotation),
      scale: parent.scale.map((value, axis) => value * scale[axis]),
    };
  };
  return resolve(index).position;
}

function animationDuration(json, animation) {
  return Math.max(0, ...(animation.samplers ?? []).map((sampler) => json.accessors?.[sampler.input]?.max?.[0] ?? 0));
}

export function auditSupportVehicleGlb(json, bytes, family, lod) {
  const spec = SUPPORT_VEHICLE_SPECS[family];
  if (!spec) throw new Error(`unknown support vehicle family ${family}`);
  const failures = [];
  const nodes = json.nodes ?? [];
  const nodeIndex = new Map(nodes.map((node, index) => [node.name, index]));
  for (const name of spec.nodes) if (!nodeIndex.has(name)) failures.push(`${family} LOD${lod}: missing authored node ${name}`);
  const root = nodes.find((node) => node.name === spec.root(lod));
  if (!root) failures.push(`${family} LOD${lod}: missing canonical root ${spec.root(lod)}`);
  if (root?.extras?.asset_id !== spec.assetId) failures.push(`${family} LOD${lod}: wrong asset id`);
  if (root?.extras?.runtime_forward_axis !== '-Z') failures.push(`${family} LOD${lod}: root does not declare runtime -Z forward`);
  if (root?.extras?.presentation_only !== true) failures.push(`${family} LOD${lod}: presentation-only boundary missing`);
  if (spec.variant && root?.extras?.presentation_variant !== spec.variant) failures.push(`${family} LOD${lod}: wrong presentation variant`);

  for (const socket of spec.sockets) {
    const index = nodeIndex.get(socket);
    if (index === undefined || typeof nodes[index]?.mesh === 'number') failures.push(`${family} LOD${lod}: ${socket} must be an authored empty socket`);
  }
  for (const socket of spec.forwardSockets) {
    const index = nodeIndex.get(socket);
    if (index !== undefined && nodeWorldTranslation(json, index)[2] >= -0.4) failures.push(`${family} LOD${lod}: ${socket} is not forward on local -Z`);
  }
  for (const [name, minimum] of Object.entries(spec.minimumMeshNodes)) {
    const index = nodeIndex.get(name);
    if (index === undefined || descendantMeshCount(json, index) < minimum) failures.push(`${family} LOD${lod}: ${name} lacks authored silhouette depth`);
  }

  const animations = new Map((json.animations ?? []).map((animation) => [animation.name, animation]));
  for (const name of spec.actions) {
    const animation = animations.get(name);
    if (!animation) failures.push(`${family} LOD${lod}: missing animation ${name}`);
    else if ((animation.channels?.length ?? 0) < (spec.minimumAnimationChannels[name] ?? 1)) failures.push(`${family} LOD${lod}: ${name} has insufficient channels`);
    else if (animationDuration(json, animation) <= 0.03) failures.push(`${family} LOD${lod}: ${name} has no useful duration`);
  }

  const material = (json.materials ?? []).find((candidate) => candidate.name === spec.material);
  if (!material?.pbrMetallicRoughness?.baseColorTexture) failures.push(`${family} LOD${lod}: albedo binding missing`);
  if (!material?.normalTexture) failures.push(`${family} LOD${lod}: normal binding missing`);
  if (!material?.pbrMetallicRoughness?.metallicRoughnessTexture) failures.push(`${family} LOD${lod}: ORM metallic/roughness binding missing`);
  if (!material?.occlusionTexture) failures.push(`${family} LOD${lod}: ORM occlusion binding missing`);
  if (!material?.emissiveTexture) failures.push(`${family} LOD${lod}: emissive binding missing`);
  if ((json.images ?? []).length < 4) failures.push(`${family} LOD${lod}: complete embedded PBR image set missing`);
  if ((json.images ?? []).some((image) => image.uri) || (json.buffers ?? []).some((buffer) => buffer.uri)) failures.push(`${family} LOD${lod}: external URI is forbidden`);
  const primitives = (json.meshes ?? []).flatMap((mesh) => mesh.primitives ?? []);
  if (!primitives.some((primitive) => primitive.attributes?.TEXCOORD_0 !== undefined && primitive.attributes?.TANGENT !== undefined)) failures.push(`${family} LOD${lod}: no UV+tangent primitive`);
  for (const extension of ['EXT_meshopt_compression', 'KHR_mesh_quantization', 'EXT_texture_webp']) {
    if (!(json.extensionsUsed ?? []).includes(extension)) failures.push(`${family} LOD${lod}: optimized extension ${extension} missing`);
  }
  const triangles = primitiveTriangles(json);
  if (triangles < 600 || triangles > 80_000) failures.push(`${family} LOD${lod}: ${triangles} triangles outside bounded budget`);
  if (bytes < 70_000 || bytes > 3_000_000) failures.push(`${family} LOD${lod}: ${bytes} bytes outside optimized budget`);
  return Object.freeze({
    failures: Object.freeze(failures), triangles, bytes,
    meshNodes: nodes.filter((node) => typeof node.mesh === 'number').length,
    materials: (json.materials ?? []).length, images: (json.images ?? []).length,
    animations: Object.freeze([...animations.keys()]), externalUris: (json.images ?? []).filter((image) => image.uri).length + (json.buffers ?? []).filter((buffer) => buffer.uri).length,
  });
}
