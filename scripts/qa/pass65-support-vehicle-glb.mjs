import { pngDimensions, readGlb } from './hunter-drone-glb.mjs';

export { pngDimensions, readGlb };

export const SUPPORT_VEHICLE_SPECS = Object.freeze({
  chopper: Object.freeze({
    assetId: 'chopper-gunner-vehicle-v1',
    root: (lod) => `Pass65Chopper_LOD${lod}`,
    variant: null,
    material: 'MAT_Pass65Chopper_Armor_PBR',
    materialRevision: 'pass70-daylight-readable-olive-pbr-v1',
    valueBreakMaterials: Object.freeze([
      'MAT_Pass65Chopper_DarkArmor', 'MAT_Pass65Chopper_Gunmetal',
      'MAT_Pass65Chopper_CockpitFrame', 'MAT_Pass65Chopper_CanopyGlass',
      'MAT_Pass65Chopper_HUDGlass', 'MAT_Pass65Chopper_HUDCyan', 'MAT_Pass65Chopper_HUDGreen',
    ]),
    nodes: Object.freeze([
      'chopper-fuselage', 'chopper-rear-fuselage', 'chopper-tail-boom', 'chopper-tail-fin',
      'chopper-sleek-cockpit-canopy', 'chopper-nose-sensor',
      'chopper-first-person-cockpit', 'chopper-gunner-sightline',
      'chopper-gunner-weapon-view',
      'chopper-cockpit-dashboard-3d', 'chopper-cockpit-display-cyan', 'chopper-cockpit-display-green',
      'chopper-cockpit-hud-glass', 'chopper-cockpit-hud-target-ring',
      'chopper-inner-windscreen-pillar-left-base', 'chopper-inner-windscreen-pillar-left-top',
      'chopper-inner-windscreen-pillar-right-base', 'chopper-inner-windscreen-pillar-right-top',
      'chopper-inner-windscreen-glow-left-base', 'chopper-inner-windscreen-glow-left-top',
      'chopper-inner-windscreen-glow-right-base', 'chopper-inner-windscreen-glow-right-top',
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
    materialRevision: 'separated-daylight-readable-pbr-v1',
    valueBreakMaterials: Object.freeze([
      'MAT_Pass65CareAircraft_Underside', 'MAT_Pass65CareAircraft_LeadingEdge',
      'MAT_Pass65CareAircraft_Tail', 'MAT_Pass65CareAircraft_EngineNacelle',
    ]),
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
    materialRevision: 'separated-daylight-readable-pbr-v1',
    valueBreakMaterials: Object.freeze([
      'MAT_Pass65CarpetAircraft_Underside', 'MAT_Pass65CarpetAircraft_LeadingEdge',
    ]),
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

function nodeWorldTransform(json, index) {
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
  return resolve(index);
}

function nodeWorldTranslation(json, index) {
  return nodeWorldTransform(json, index).position;
}

function transformPoint(transform, point) {
  const scaled = point.map((value, axis) => value * transform.scale[axis]);
  const rotated = rotateVector(transform.rotation, scaled);
  return transform.position.map((value, axis) => value + rotated[axis]);
}

function normalizedAccessorExtrema(accessor, axis) {
  const decode = (value) => {
    if (!accessor.normalized) return value;
    if (accessor.componentType === 5120) return Math.max(value / 127, -1);
    if (accessor.componentType === 5121) return value / 255;
    if (accessor.componentType === 5122) return Math.max(value / 32767, -1);
    if (accessor.componentType === 5123) return value / 65535;
    return Number.NaN;
  };
  return [decode(accessor.min?.[axis]), decode(accessor.max?.[axis])];
}

const CHOPPER_COCKPIT_FRAMING_REVISION = 'pass71-tall-pillars-centre-clear-v1';
const CHOPPER_COCKPIT_PILLAR_RADIUS_M = 0.035;
const CHOPPER_COCKPIT_GLOW_RADIUS_M = 0.012;
const CHOPPER_COCKPIT_EDGE_MARGIN_PX = 2;
const CHOPPER_COCKPIT_RETICLE_MARGIN_PX = 8;
const CHOPPER_COCKPIT_MAXIMUM_TOP_VIEWPORT_RATIO = 0.24;
const CHOPPER_COCKPIT_FRAMING_CASES = Object.freeze([
  Object.freeze({ label: 'desktop-720p-min-fov', width: 1280, height: 720, fov: 70 }),
  Object.freeze({ label: 'desktop-720p-max-fov', width: 1280, height: 720, fov: 100 }),
  Object.freeze({ label: 'desktop-1080p-min-fov', width: 1920, height: 1080, fov: 70 }),
  Object.freeze({ label: 'desktop-1080p-max-fov', width: 1920, height: 1080, fov: 100 }),
  Object.freeze({ label: 'iphone-15-landscape-min-fov', width: 844, height: 390, fov: 70 }),
  Object.freeze({ label: 'iphone-15-landscape-max-fov', width: 844, height: 390, fov: 100 }),
  Object.freeze({ label: 'iphone-15-portrait-min-fov', width: 390, height: 844, fov: 70 }),
  Object.freeze({ label: 'iphone-15-portrait-max-fov', width: 390, height: 844, fov: 100 }),
]);

function chopperReticleDiameterPx(width, height) {
  const compact = width <= 760 || height <= 520;
  const preferred = compact ? width * 0.28 : Math.min(height * 0.20, width * 0.16);
  return Math.min(compact ? 142 : 188, Math.max(compact ? 104 : 126, preferred));
}

function chopperCockpitFramingAudit(json, nodeIndex, lod) {
  const failures = [];
  const cameraIndex = nodeIndex.get('chopper-first-person-camera-socket');
  if (cameraIndex === undefined) return { failures: [`chopper LOD${lod}: cockpit framing camera socket missing`], cases: [] };
  const camera = nodeWorldTranslation(json, cameraIndex);
  const elements = [
    { kind: 'pillar', side: 'left', authoredSide: -1, radius: CHOPPER_COCKPIT_PILLAR_RADIUS_M },
    { kind: 'pillar', side: 'right', authoredSide: 1, radius: CHOPPER_COCKPIT_PILLAR_RADIUS_M },
    { kind: 'glow', side: 'left', authoredSide: -1, radius: CHOPPER_COCKPIT_GLOW_RADIUS_M },
    { kind: 'glow', side: 'right', authoredSide: 1, radius: CHOPPER_COCKPIT_GLOW_RADIUS_M },
  ];
  const endpointDistance = (left, right) => Math.hypot(...left.map((value, axis) => value - right[axis]));
  const auditedElements = [];
  const assertMeshEndpoints = (label, meshName, base, top) => {
    const meshIndex = nodeIndex.get(meshName);
    if (meshIndex === undefined) {
      failures.push(`chopper LOD${lod}: ${label} mesh missing`);
      return;
    }
    const meshTransform = nodeWorldTransform(json, meshIndex);
    // Blender cylinders are authored along local Z and exported Y-up. Verify
    // the actual optimized mesh axis instead of assuming a normalized +/-1
    // primitive. glTF accessor bounds remain quantized component values, so
    // decode normalization before comparing the geometry with the semantic
    // endpoints. This rejects both the former radial-axis scale mutation and
    // a mesh whose node transform is correct but whose geometry is too short.
    const expectedHalfLength = endpointDistance(base, top) / 2;
    const axisScale = Math.abs(meshTransform.scale[1]);
    const expectedLocalHalfLength = axisScale > 0 ? expectedHalfLength / axisScale : Number.NaN;
    const mesh = json.meshes?.[json.nodes?.[meshIndex]?.mesh];
    const positionExtrema = (mesh?.primitives ?? []).map((primitive) => (
      normalizedAccessorExtrema(json.accessors?.[primitive.attributes?.POSITION] ?? {}, 1)
    ));
    const localMinimum = Math.min(...positionExtrema.map(([minimum]) => minimum));
    const localMaximum = Math.max(...positionExtrema.map(([, maximum]) => maximum));
    const extentError = Math.max(
      Math.abs(localMinimum + expectedLocalHalfLength),
      Math.abs(localMaximum - expectedLocalHalfLength),
    ) * axisScale;
    if (!Number.isFinite(extentError) || extentError > 0.002) {
      failures.push(`chopper LOD${lod}: ${label} mesh normalized POSITION Y extent does not match audited semantic half-length`);
      return;
    }
    const meshEndpoints = [
      transformPoint(meshTransform, [0, localMinimum, 0]),
      transformPoint(meshTransform, [0, localMaximum, 0]),
    ];
    const directError = endpointDistance(meshEndpoints[0], base) + endpointDistance(meshEndpoints[1], top);
    const reversedError = endpointDistance(meshEndpoints[1], base) + endpointDistance(meshEndpoints[0], top);
    if (Math.min(directError, reversedError) > 0.004) {
      failures.push(`chopper LOD${lod}: ${label} mesh does not terminate at its audited semantic endpoints`);
    }
  };
  for (const element of elements) {
    const baseName = `chopper-inner-windscreen-${element.kind}-${element.side}-base`;
    const topName = `chopper-inner-windscreen-${element.kind}-${element.side}-top`;
    const meshFamily = element.kind === 'pillar' ? 'Pillar' : 'Glow';
    const meshName = `Chopper_InnerWindscreen${meshFamily}_${element.authoredSide}_LOD${lod}`;
    const baseIndex = nodeIndex.get(baseName);
    const topIndex = nodeIndex.get(topName);
    if (baseIndex === undefined || topIndex === undefined) {
      failures.push(`chopper LOD${lod}: ${element.side} authored cockpit ${element.kind} endpoints missing`);
      continue;
    }
    const base = nodeWorldTranslation(json, baseIndex);
    const top = nodeWorldTranslation(json, topIndex);
    assertMeshEndpoints(`${element.side} ${element.kind}`, meshName, base, top);
    auditedElements.push({ ...element, base, top });
  }
  const endpoint = (kind, side, edge) => auditedElements
    .find((element) => element.kind === kind && element.side === side)?.[edge];
  const headerEndpoints = [endpoint('pillar', 'left', 'top'), endpoint('pillar', 'right', 'top')];
  const headerGlowEndpoints = [endpoint('glow', 'left', 'top'), endpoint('glow', 'right', 'top')];
  if (headerEndpoints.every(Boolean)) {
    assertMeshEndpoints('header', `Chopper_InnerWindscreenHeader_LOD${lod}`, ...headerEndpoints);
  }
  if (headerGlowEndpoints.every(Boolean)) {
    assertMeshEndpoints('header glow', `Chopper_InnerWindscreenHeaderGlow_LOD${lod}`, ...headerGlowEndpoints);
  }

  const caseReceipts = [];
  for (const viewport of CHOPPER_COCKPIT_FRAMING_CASES) {
    const tangent = Math.tan((viewport.fov * Math.PI / 180) / 2);
    const focalPixels = viewport.height / (2 * tangent);
    const reticleDiameter = chopperReticleDiameterPx(viewport.width, viewport.height);
    const reticleTop = (viewport.height - reticleDiameter) / 2;
    const reticleBottom = (viewport.height + reticleDiameter) / 2;
    const elementReceipts = [];
    for (const element of auditedElements) {
      const toCamera = (point) => ({
        x: point[0] - camera[0],
        y: point[1] - camera[1],
        depth: camera[2] - point[2],
      });
      const base = toCamera(element.base);
      const top = toCamera(element.top);
      const project = (point) => ({
        x: viewport.width / 2 + focalPixels * point.x / point.depth,
        y: viewport.height / 2 - focalPixels * point.y / point.depth,
      });
      const basePx = project(base);
      const topPx = project(top);
      if (!(base.depth > 0 && top.depth > 0)) {
        failures.push(`chopper LOD${lod}: ${element.side} ${element.kind} is behind ${viewport.label} camera`);
        continue;
      }
      const verticalSamples = [reticleTop, reticleBottom];
      const clearances = verticalSamples.map((screenY) => {
        const projectedYOverDepth = (viewport.height / 2 - screenY) / focalPixels;
        const deltaY = top.y - base.y;
        const deltaDepth = top.depth - base.depth;
        const denominator = deltaY - projectedYOverDepth * deltaDepth;
        const t = denominator === 0
          ? Number.NaN
          : (projectedYOverDepth * base.depth - base.y) / denominator;
        if (!Number.isFinite(t) || t < 0 || t > 1) return Number.NEGATIVE_INFINITY;
        const depth = base.depth + t * deltaDepth;
        const x = base.x + t * (top.x - base.x);
        const horizontalDistance = Math.abs(focalPixels * x / depth);
        const radiusPixels = focalPixels * element.radius / depth;
        return horizontalDistance - reticleDiameter / 2 - radiusPixels - CHOPPER_COCKPIT_RETICLE_MARGIN_PX;
      });
      const topRatio = topPx.y / viewport.height;
      const topRadiusPixels = focalPixels * element.radius / top.depth;
      const centreClearance = Math.min(...clearances);
      if (topPx.y - topRadiusPixels < CHOPPER_COCKPIT_EDGE_MARGIN_PX
        || topRatio > CHOPPER_COCKPIT_MAXIMUM_TOP_VIEWPORT_RATIO) {
        failures.push(`chopper LOD${lod}: ${element.side} ${element.kind} does not reach the bounded upper viewport in ${viewport.label}`);
      }
      if (!(basePx.y > reticleBottom && topPx.y < reticleTop && centreClearance >= 0)) {
        failures.push(`chopper LOD${lod}: ${element.side} ${element.kind} enters the protected reticle corridor in ${viewport.label}`);
      }
      elementReceipts.push(Object.freeze({
        kind: element.kind,
        side: element.side,
        topViewportRatio: Number(topRatio.toFixed(6)),
        centreClearancePx: Number(centreClearance.toFixed(3)),
      }));
    }
    const headers = [
      { kind: 'header', radius: CHOPPER_COCKPIT_PILLAR_RADIUS_M, endpoints: headerEndpoints },
      { kind: 'header-glow', radius: CHOPPER_COCKPIT_GLOW_RADIUS_M, endpoints: headerGlowEndpoints },
    ].flatMap((header) => {
      if (!header.endpoints.every(Boolean)) return [];
      const points = header.endpoints.map((point) => ({
        x: point[0] - camera[0], y: point[1] - camera[1], depth: camera[2] - point[2],
      }));
      const centre = points.map((point) => ({
        x: viewport.width / 2 + focalPixels * point.x / point.depth,
        y: viewport.height / 2 - focalPixels * point.y / point.depth,
        radius: focalPixels * header.radius / point.depth,
      }));
      const maximumBottomPx = Math.max(...centre.map((point) => point.y + point.radius));
      const minimumTopPx = Math.min(...centre.map((point) => point.y - point.radius));
      if (minimumTopPx < CHOPPER_COCKPIT_EDGE_MARGIN_PX
        || maximumBottomPx > reticleTop - CHOPPER_COCKPIT_RETICLE_MARGIN_PX) {
        failures.push(`chopper LOD${lod}: ${header.kind} is cropped or enters the protected reticle corridor in ${viewport.label}`);
      }
      return [Object.freeze({
        kind: header.kind,
        minimumTopPx: Number(minimumTopPx.toFixed(3)),
        maximumBottomPx: Number(maximumBottomPx.toFixed(3)),
      })];
    });
    caseReceipts.push(Object.freeze({
      ...viewport,
      reticleDiameter,
      elements: Object.freeze(elementReceipts),
      headers: Object.freeze(headers),
    }));
  }
  return Object.freeze({ failures: Object.freeze(failures), cases: Object.freeze(caseReceipts) });
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
  if (spec.materialRevision && root?.extras?.material_revision !== spec.materialRevision) {
    failures.push(`${family} LOD${lod}: daylight-readable material revision missing`);
  }
  for (const name of spec.valueBreakMaterials ?? []) {
    if (!(json.materials ?? []).some((material) => material.name === name)) {
      failures.push(`${family} LOD${lod}: authored value-break material ${name} missing`);
    }
  }
  const detailCounts = {};
  let cockpitFraming = null;
  if (family === 'chopper') {
    if (root?.extras?.visual_revision !== 'pass70-connected-rear-tail-airframe-v7'
      || root?.extras?.detail_contract !== 'continuous-rear-tail-silhouette-cockpit-clear-sightline-v7') {
      failures.push(`chopper LOD${lod}: authored airframe refinement contract missing`);
    }
    if (root?.extras?.first_person_cockpit_framing !== CHOPPER_COCKPIT_FRAMING_REVISION
      || root?.extras?.first_person_cockpit_pillar_radius_m !== CHOPPER_COCKPIT_PILLAR_RADIUS_M) {
      failures.push(`chopper LOD${lod}: tall centre-clear first-person cockpit framing contract missing`);
    }
    cockpitFraming = chopperCockpitFramingAudit(json, nodeIndex, lod);
    failures.push(...cockpitFraming.failures);
    const requiredDetail = [
      ['Chopper_ArmoredNose_', 1],
      ['Chopper_CheekArmor_', 2],
      ['Chopper_TandemPilotCanopy_', 1],
      ['Chopper_TandemGunnerCanopy_', 1],
      ['Chopper_TandemDivider_', 2],
      ['Chopper_CanopyCrossBrace_', 3],
      ['Chopper_EngineIntake_', 2],
      ['Chopper_EngineExhaust_', 2],
      ['Chopper_RocketPod_', 2],
      ['Chopper_RocketPodMuzzleCollar_', 2],
      ['Chopper_RocketTube_', lod === 0 ? 14 : lod === 1 ? 8 : 2],
      ['Chopper_Missile_', lod === 0 ? 4 : 2],
      ['Chopper_SensorLens_', 2],
      ['Chopper_RotorYoke_', 2],
      ['Chopper_MainBladeGrip_', 4],
      ['Chopper_TailBladeGrip_', 4],
      ['Chopper_TailGearbox_', 1],
      ['Chopper_TailRootCollar_', 1],
      ['Chopper_GunBarrelCollar_', 3],
      ['Chopper_GunArmourShroud_', 2],
      ['Chopper_SkidDamper_', 4],
    ];
    if (lod === 0) requiredDetail.push(
      ['Chopper_OverlappingArmorPlate_', 8], ['Chopper_ArmorFastener_', 16],
      ['Chopper_DorsalArmorPanel_', 1], ['Chopper_NoseArmorCap_', 1],
      ['Chopper_EngineDeckLouver_', 4], ['Chopper_CanopyArmourBrow_', 2],
      ['Chopper_CanopyRoofArmor_', 1], ['Chopper_CanopyArmorBolt_', 4],
      ['Chopper_FuselagePanelSeam_', 6], ['Chopper_GunFeedLink_', 5],
      ['Chopper_SkidWearShoe_', 4],
    );
    else if (lod === 1) requiredDetail.push(
      ['Chopper_OverlappingArmorPlate_', 4], ['Chopper_DorsalArmorPanel_', 1],
      ['Chopper_CanopyArmourBrow_', 2],
    );
    for (const [prefix, minimum] of requiredDetail) {
      const count = nodes.filter((node) => node.name?.startsWith(prefix)).length;
      detailCounts[prefix] = count;
      if (count < minimum) failures.push(`chopper LOD${lod}: ${prefix} detail count ${count} is below ${minimum}`);
    }
    const authoredMaterials = new Map((json.materials ?? []).map((material) => [material.name, material]));
    const canopyGlass = authoredMaterials.get('MAT_Pass65Chopper_CanopyGlass');
    const hudGlass = authoredMaterials.get('MAT_Pass65Chopper_HUDGlass');
    const materialAlpha = (material) => material?.pbrMetallicRoughness?.baseColorFactor?.[3] ?? 1;
    if (canopyGlass?.alphaMode !== 'BLEND' || materialAlpha(canopyGlass) < 0.25 || materialAlpha(canopyGlass) > 0.48) {
      failures.push(`chopper LOD${lod}: canopy must remain transparent readable glass, never an opaque block`);
    }
    if (hudGlass?.alphaMode !== 'BLEND' || materialAlpha(hudGlass) > 0.18) {
      failures.push(`chopper LOD${lod}: HUD combiner must remain clear projected glass`);
    }
    for (const name of [
      'MAT_Pass65Chopper_Armor_PBR', 'MAT_Pass65Chopper_DarkArmor',
      'MAT_Pass65Chopper_Gunmetal', 'MAT_Pass65Chopper_CockpitFrame',
    ]) {
      const authored = authoredMaterials.get(name);
      if (!authored || authored.alphaMode === 'BLEND' || materialAlpha(authored) < 0.99) {
        failures.push(`chopper LOD${lod}: ${name} must remain opaque standard glTF PBR for WebGL2/WebGPU parity`);
      }
    }
  } else if (family === 'care') {
    if (root?.extras?.visual_revision !== 'close-range-heavy-cargo-aircraft-v4'
      || root?.extras?.detail_contract !== 'framed-flightdeck-panelled-hull-ramp-bogie-turbofans-v4') {
      failures.push(`care LOD${lod}: heavy cargo-aircraft refinement contract missing`);
    }
    const requiredDetail = [
      ['Care_FlightDeckOuterFrame_', 2], ['Care_TurbofanIntakeRing_', 4],
      ['Care_TurbofanExhaustRing_', 4], ['Care_PropBlade_', lod === 0 ? 40 : lod === 1 ? 28 : 16],
      ['Care_FuselagePanel_', 10], ['Care_MainGearSponson_', 2],
      ['Care_RearCargoRamp_', 1], ['Care_RearCargoAperture_', 1],
      ['Care_NoseWheel_', 2], ['Care_MainWheel_', lod < 2 ? 6 : 4],
    ];
    if (lod < 2) requiredDetail.push(
      ['Care_WingPanelBreak_', 6], ['Care_RampTrack_', 3],
      ['Care_RampCrossRib_', 3], ['Care_RampHinge_', 2],
      ['Care_RampLockHousing_', 2], ['Care_MainGearBogieBeam_', 2],
    );
    if (lod === 0) requiredDetail.push(
      ['Care_FlightDeckArmourBrow_', 1], ['Care_FlightDeckCheekArmor_', 2],
      ['Care_FlightDeckFastener_', 6], ['Care_FlightDeckFrontPane_', 4],
      ['Care_FlightDeckFrontMullion_', 3], ['Care_RearApertureHeader_', 1],
      ['Care_RearApertureFrame_', 2], ['Care_FuselageLongitudinalBreak_', 4],
      ['Care_FuselageServiceHatch_', 6], ['Care_FuselageServiceLatch_', 6],
      ['Care_NoseWheelHub_', 2], ['Care_MainGearDragBrace_', 2], ['Care_MainWheelHub_', 6],
    );
    for (const [prefix, minimum] of requiredDetail) {
      const count = nodes.filter((node) => node.name?.startsWith(prefix)).length;
      detailCounts[prefix] = count;
      if (count < minimum) failures.push(`care LOD${lod}: ${prefix} detail count ${count} is below ${minimum}`);
    }
  } else if (family === 'carpet') {
    if (root?.extras?.visual_revision !== 'close-range-stealth-flying-wing-v4'
      || root?.extras?.detail_contract !== 'framed-intakes-service-panels-bay-structure-tailless-v4') {
      failures.push(`carpet LOD${lod}: stealth flying-wing refinement contract missing`);
    }
    const requiredDetail = [
      ['Carpet_BlendedCentreBody_', 1], ['Carpet_SweptWing_', 2],
      ['Carpet_TrailingControl_', 6], ['Carpet_BuriedIntake_', 4],
      ['Carpet_IntakeLip_', 4], ['Carpet_FanBlade_', lod === 0 ? 32 : lod === 1 ? 24 : 12],
      ['Carpet_ExhaustSlot_', 4], ['Carpet_BombBayCavity_', 1], ['Carpet_BombBayRail_', 3],
    ];
    if (lod < 2) requiredDetail.push(
      ['Carpet_WingPanelSeam_', 8], ['Carpet_BombBayCrossFrame_', 4],
      ['Carpet_BombBaySideFrame_', 2], ['Carpet_BombDoorHinge_', 4],
    );
    if (lod === 0) requiredDetail.push(
      ['Carpet_WingServicePanel_', 6], ['Carpet_WingServiceLatch_', 6],
      ['Carpet_IntakeSplitter_', 4], ['Carpet_IntakeFrame_', 8],
    );
    for (const [prefix, minimum] of requiredDetail) {
      const count = nodes.filter((node) => node.name?.startsWith(prefix)).length;
      detailCounts[prefix] = count;
      if (count < minimum) failures.push(`carpet LOD${lod}: ${prefix} detail count ${count} is below ${minimum}`);
    }
    if (nodes.some((node) => /^Carpet_(?:TailFin|TailPlane)_/u.test(node.name ?? ''))) {
      failures.push(`carpet LOD${lod}: conventional tail surfaces violate the flying-wing silhouette contract`);
    }
  } else if (family === 'crate') {
    if (root?.extras?.visual_revision !== 'close-range-rigged-pallet-drop-v4'
      || root?.extras?.detail_contract !== 'corner-guards-buckles-latches-crossweb-ribbed-canopy-v4') {
      failures.push(`crate LOD${lod}: parachute/crate refinement contract missing`);
    }
    const requiredDetail = [
      ['Care_CrateLid_', 1], ['Care_CratePallet_', 1], ['Care_CratePalletSlat_', 3],
      ['Care_CrateCornerGuard_', 4], ['Care_CrateBuckle_', 2],
      ['Care_ParachuteRib_', lod === 0 ? 12 : 8], ['Care_ParachuteSkirt_', 1], ['Care_ParachuteVent_', 1],
    ];
    if (lod === 0) requiredDetail.push(
      ['Care_CrateLatch_', 4], ['Care_CrateLatchPin_', 4], ['Care_PalletTieDownCleat_', 4],
    );
    for (const [prefix, minimum] of requiredDetail) {
      const count = nodes.filter((node) => node.name?.startsWith(prefix)).length;
      detailCounts[prefix] = count;
      if (count < minimum) failures.push(`crate LOD${lod}: ${prefix} detail count ${count} is below ${minimum}`);
    }
  }

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
  const triangleRanges = {
    chopper: [[45_000, 60_000], [36_000, 50_000], [20_000, 32_000]],
    care: [[16_000, 18_000], [13_000, 16_000], [10_000, 13_000]],
    carpet: [[10_500, 12_000], [8_500, 9_800], [4_800, 5_800]],
    crate: [[5_500, 7_000], [4_000, 5_000]],
  };
  const [minimum, maximum] = triangleRanges[family]?.[lod] ?? [Number.POSITIVE_INFINITY, Number.NEGATIVE_INFINITY];
  if (triangles < minimum || triangles > maximum) {
    failures.push(`${family} LOD${lod}: ${triangles} triangles outside authored ${minimum}-${maximum} budget`);
  }
  if (bytes < 70_000 || bytes > 3_000_000) failures.push(`${family} LOD${lod}: ${bytes} bytes outside optimized budget`);
  return Object.freeze({
    failures: Object.freeze(failures), triangles, bytes,
    meshNodes: nodes.filter((node) => typeof node.mesh === 'number').length,
    materials: (json.materials ?? []).length, images: (json.images ?? []).length,
    animations: Object.freeze([...animations.keys()]), externalUris: (json.images ?? []).filter((image) => image.uri).length + (json.buffers ?? []).filter((buffer) => buffer.uri).length,
    detailCounts: Object.freeze(detailCounts),
    ...(cockpitFraming ? { cockpitFraming } : {}),
  });
}
