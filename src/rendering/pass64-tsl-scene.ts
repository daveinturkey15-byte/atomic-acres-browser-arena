import * as THREE from 'three';
import {
  DoubleSide,
  MeshStandardNodeMaterial,
  PointsNodeMaterial,
  type RenderPipeline,
} from 'three/webgpu';
import { SkyMesh } from 'three/addons/objects/SkyMesh.js';
import { bloom } from 'three/addons/tsl/display/BloomNode.js';
import {
  abs,
  color,
  dot,
  float,
  fract,
  instanceIndex,
  mix,
  max,
  pass,
  positionLocal,
  positionWorld,
  screenUV,
  screenSize,
  sin,
  smoothstep,
  time,
  uniform,
  vec2,
  vec3,
  vec4,
} from 'three/tsl';
import type { ArenaVisualDefinition } from './arena-visual-definition';
import { createGrassPlacements } from '../grass-placement';
import { TSL_MIGRATION_INVENTORY } from './tsl-migration-inventory';

export type RuntimeTslTraversal = Readonly<{
  legacyShaderMaterials: readonly string[];
  nodeMaterialPipelineIds: readonly string[];
  compiledPipelineIds: readonly string[];
}>;

export type Pass64TslSceneSystems = Readonly<{
  root: THREE.Group;
  principalHdrTarget: THREE.RenderTarget;
  bloomSamples: 0;
  depthAwareBloom: true;
  bloomGraphId: 'pass64.full-scene-depth-tested-bloom.v1';
  bloomOcclusionSource: 'authoritative-scene-depth';
  compiledPipelineIds: readonly string[];
  applyDefinition(definition: ArenaVisualDefinition): void;
  dispose(): void;
}>;

const PIPELINE = Object.freeze({
  sky: 'pass64.sky-atmosphere.tsl.v1',
  hdr: 'pass64.hdr-grade-grain.tsl.v1',
  mist: 'pass64.atmosphere-mist.tsl.v1',
  smoke: 'pass64.atmosphere-smoke.tsl.v1',
  dust: 'pass64.atmosphere-dust.tsl.v1',
  grass: 'pass64.grass.tsl.v1',
  water: 'pass64.water.tsl.v1',
});

type AtmosphereReviewLayout = Readonly<{
  mist: readonly (readonly [number, number, number, number])[];
  smoke: readonly (readonly [number, number, number, number])[];
  dust: Readonly<{ count: number; minX: number; maxX: number; minZ: number; maxZ: number }>;
}>;

function atmosphereLayout(
  mist: AtmosphereReviewLayout['mist'],
  smoke: AtmosphereReviewLayout['smoke'],
  dust: AtmosphereReviewLayout['dust'],
): AtmosphereReviewLayout {
  return Object.freeze({ mist: Object.freeze([...mist]), smoke: Object.freeze([...smoke]), dust: Object.freeze({ ...dust }) });
}

const ATMOSPHERE_LAYOUTS: Readonly<Record<ArenaVisualDefinition['id'], AtmosphereReviewLayout>> = Object.freeze({
  'atomic-acres': atmosphereLayout(
    [[-27, -18, 17, 5.2], [27, -23, 15, 4.8], [-8, -35, 13, 3.5]],
    [[-1.7, 13.4, 2.5, 4.4], [-4.2, -31.2, 2.6, 4.8], [29.8, -14.2, 2.4, 4.2]],
    { count: 64, minX: -37, maxX: 37, minZ: -39, maxZ: 39 },
  ),
  'rustworks-1v1': atmosphereLayout(
    [[-21, -18, 13, 4.4], [20, 18, 13, 4.4], [0, -12, 9, 3]],
    [[-19, 9, 2.4, 4.4], [19, -10, 2.4, 4.4], [0, 1, 2.8, 5.4]],
    { count: 96, minX: -28, maxX: 28, minZ: -30, maxZ: 30 },
  ),
  'gun-range': atmosphereLayout(
    [[-11.5, -7, 7, 2.8], [10.5, -17, 7, 2.8], [9, -38, 6.5, 2.5]],
    [[-13.5, -18, 1.8, 3.8], [13.5, -32, 1.8, 3.8]],
    { count: 32, minX: -15, maxX: 15, minZ: -44, maxZ: -3 },
  ),
  'skyline-terminal': atmosphereLayout(
    [[-22, 10, 14, 4.2], [22, 10, 14, 4.2], [0, -10, 10, 3.2]],
    [[-18, 16, 2.4, 4.2], [18, 16, 2.4, 4.2], [0, -22, 2.2, 3.8]],
    { count: 80, minX: -34, maxX: 34, minZ: -34, maxZ: 34 },
  ),
});

function tagPipeline(material: THREE.Material, pipelineId: string): void {
  material.userData.tslPipelineId = pipelineId;
}

function makeSky(): THREE.Object3D {
  const sky = new SkyMesh();
  sky.name = 'Pass 64 TSL atmosphere sky';
  sky.scale.setScalar(420);
  sky.turbidity.value = 4.2;
  sky.rayleigh.value = 1.75;
  sky.mieCoefficient.value = 0.004;
  sky.mieDirectionalG.value = 0.78;
  sky.sunPosition.value.set(0.45, 0.72, -0.22).normalize();
  tagPipeline(sky.material, PIPELINE.sky);
  return sky;
}

function makeMist(definition: ArenaVisualDefinition): THREE.Group {
  const root = new THREE.Group();
  root.name = 'Pass 64 TSL mist';
  const material = new PointsNodeMaterial({ transparent: true, depthWrite: false, size: 0.34, sizeAttenuation: true });
  const drift = sin(positionWorld.x.mul(0.075).add(time.mul(0.055))).mul(0.5).add(0.5);
  const mistStrength = uniform(Math.min(0.12, 0.035 + definition.atmosphere.mist * 0.09));
  material.colorNode = mix(color(0x7fa5ae), color(0xd0d9cf), drift);
  material.opacityNode = mistStrength.mul(drift.mul(0.35).add(0.65));
  tagPipeline(material, PIPELINE.mist);
  root.userData.opacityUniform = mistStrength;
  const positions = new Float32Array(48 * 3);
  for (let index = 0; index < 48; index += 1) {
    positions[index * 3] = seededUnit(index, 11) - 0.5;
    positions[index * 3 + 1] = seededUnit(index, 12) * 0.8;
    positions[index * 3 + 2] = seededUnit(index, 13) - 0.5;
  }
  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute('position', new THREE.BufferAttribute(positions, 3));
  for (const [x, z, width, depth] of ATMOSPHERE_LAYOUTS[definition.id].mist) {
    const layer = new THREE.Points(geometry, material);
    layer.position.set(x, 0.08, z);
    layer.scale.set(width, 0.85, depth);
    root.add(layer);
  }
  return root;
}

function makeSmoke(definition: ArenaVisualDefinition): THREE.Group {
  const root = new THREE.Group();
  root.name = 'Pass 64 TSL smoke';
  const material = new PointsNodeMaterial({ transparent: true, depthWrite: false, size: 0.46, sizeAttenuation: true });
  const billow = sin(positionWorld.y.mul(0.7).sub(time.mul(0.33))).mul(0.5).add(0.5);
  const smokeStrength = uniform(0.035 + definition.atmosphere.mist * 0.12);
  material.colorNode = mix(color(0x2f3b3e), color(0x7d8984), billow);
  material.opacityNode = smokeStrength.mul(billow.mul(0.58).add(0.42));
  tagPipeline(material, PIPELINE.smoke);
  root.userData.opacityUniform = smokeStrength;
  const positions = new Float32Array(36 * 3);
  for (let index = 0; index < 36; index += 1) {
    positions[index * 3] = seededUnit(index, 21) - 0.5;
    positions[index * 3 + 1] = seededUnit(index, 22) - 0.5;
    positions[index * 3 + 2] = seededUnit(index, 23) - 0.5;
  }
  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute('position', new THREE.BufferAttribute(positions, 3));
  for (const [x, z, width, height] of ATMOSPHERE_LAYOUTS[definition.id].smoke) {
    const puff = new THREE.Points(geometry, material);
    puff.position.set(x, height * 0.5 + 0.15, z);
    puff.scale.set(width, height, width);
    root.add(puff);
  }
  return root;
}

function seededUnit(index: number, salt: number): number {
  const value = Math.sin((index + 1) * (12.9898 + salt * 8.233)) * 43758.5453;
  return value - Math.floor(value);
}

function makeDust(definition: ArenaVisualDefinition): THREE.Points {
  const layout = ATMOSPHERE_LAYOUTS[definition.id].dust;
  const count = Math.max(...Object.values(ATMOSPHERE_LAYOUTS).map((entry) => entry.dust.count));
  const positions = new Float32Array(count * 3);
  for (let index = 0; index < count; index += 1) {
    positions[index * 3] = layout.minX + seededUnit(index, 1) * (layout.maxX - layout.minX);
    positions[index * 3 + 1] = 0.4 + seededUnit(index, 2) * 16;
    positions[index * 3 + 2] = layout.minZ + seededUnit(index, 3) * (layout.maxZ - layout.minZ);
  }
  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute('position', new THREE.BufferAttribute(positions, 3));
  const material = new PointsNodeMaterial({ transparent: true, depthWrite: false, size: 1 });
  const flicker = sin(time.mul(0.7).add(positionWorld.x.mul(0.21))).mul(0.5).add(0.5);
  const dustStrength = uniform(Math.min(0.32, 0.08 + definition.atmosphere.dust * 0.72));
  material.colorNode = mix(color(0xd7b47b), color(0xffebc7), flicker);
  material.opacityNode = dustStrength.mul(flicker.mul(0.45).add(0.55));
  tagPipeline(material, PIPELINE.dust);
  const dust = new THREE.Points(geometry, material);
  dust.name = 'Pass 64 TSL deterministic dust';
  dust.userData.opacityUniform = dustStrength;
  geometry.setDrawRange(0, layout.count);
  return dust;
}

function applyArenaSystemLayout(root: THREE.Group, definition: ArenaVisualDefinition): void {
  const layout = ATMOSPHERE_LAYOUTS[definition.id];
  const mist = root.getObjectByName('Pass 64 TSL mist');
  const mistUniform = mist?.userData.opacityUniform as { value: number } | undefined;
  if (mistUniform) mistUniform.value = Math.min(0.12, 0.035 + definition.atmosphere.mist * 0.09);
  mist?.children.forEach((node, index) => {
    const placement = layout.mist[index];
    node.visible = placement !== undefined;
    if (placement) {
      const [x, z, width, depth] = placement;
      node.position.set(x, 0.08, z);
      node.scale.set(width, 0.85, depth);
    }
  });
  const smoke = root.getObjectByName('Pass 64 TSL smoke');
  const smokeUniform = smoke?.userData.opacityUniform as { value: number } | undefined;
  if (smokeUniform) smokeUniform.value = 0.035 + definition.atmosphere.mist * 0.12;
  smoke?.children.forEach((node, index) => {
    const placement = layout.smoke[index];
    node.visible = placement !== undefined;
    if (placement) {
      const [x, z, width, height] = placement;
      node.position.set(x, height * 0.5 + 0.15, z);
      node.scale.set(width, height, width);
    }
  });
  const dust = root.getObjectByName('Pass 64 TSL deterministic dust') as THREE.Points | undefined;
  const dustUniform = dust?.userData.opacityUniform as { value: number } | undefined;
  if (dustUniform) dustUniform.value = Math.min(0.32, 0.08 + definition.atmosphere.dust * 0.72);
  const positions = dust?.geometry.getAttribute('position') as THREE.BufferAttribute | undefined;
  if (dust && positions) {
    for (let index = 0; index < positions.count; index += 1) {
      positions.setXYZ(
        index,
        layout.dust.minX + seededUnit(index, 1) * (layout.dust.maxX - layout.dust.minX),
        0.4 + seededUnit(index, 2) * 16,
        layout.dust.minZ + seededUnit(index, 3) * (layout.dust.maxZ - layout.dust.minZ),
      );
    }
    positions.needsUpdate = true;
    dust.geometry.setDrawRange(0, layout.dust.count);
  }
  const grass = root.getObjectByName('Pass 64 TSL grass');
  if (grass) grass.visible = definition.id === 'atomic-acres';
  const water = root.getObjectByName('Pass 64 TSL perimeter water');
  if (water) water.visible = definition.id === 'rustworks-1v1';
  const sky = root.getObjectByName('Pass 64 TSL atmosphere sky') as SkyMesh | undefined;
  if (sky) {
    sky.turbidity.value = definition.atmosphere.clouds ? 4.2 : 1.2;
    sky.rayleigh.value = definition.atmosphere.clouds ? 1.75 : 0.85;
  }
  root.userData.tslArenaVisualDefinitionId = definition.id;
  root.userData.tslAtmosphere = { ...definition.atmosphere };
}

function makeGrass(arenaId: ArenaVisualDefinition['id']): THREE.InstancedMesh {
  const placements = createGrassPlacements([], 180).placements;
  const geometry = new THREE.PlaneGeometry(1, 1, 1, 3);
  geometry.translate(0, 0.5, 0);
  const material = new MeshStandardNodeMaterial({ side: DoubleSide, roughness: 0.92, metalness: 0 });
  const wind = sin(time.mul(1.35).add(float(instanceIndex).mul(0.73))).mul(positionLocal.y).mul(0.045);
  material.positionNode = positionLocal.add(vec3(wind, 0, 0));
  material.colorNode = mix(color(0x254c2e), color(0x7f9f51), positionLocal.y);
  tagPipeline(material, PIPELINE.grass);
  const count = placements.length;
  const grass = new THREE.InstancedMesh(geometry, material, count);
  grass.name = 'Pass 64 TSL grass';
  const matrix = new THREE.Matrix4();
  const position = new THREE.Vector3();
  const rotation = new THREE.Quaternion();
  const scale = new THREE.Vector3();
  for (let index = 0; index < count; index += 1) {
    const placement = placements[index];
    position.set(placement.x, 0.02, placement.z);
    rotation.setFromAxisAngle(new THREE.Vector3(0, 1, 0), placement.yaw);
    scale.set(placement.width, placement.height, 1);
    grass.setMatrixAt(index, matrix.compose(position, rotation, scale));
  }
  grass.instanceMatrix.needsUpdate = true;
  grass.castShadow = false;
  grass.receiveShadow = true;
  grass.frustumCulled = false;
  grass.visible = arenaId === 'atomic-acres';
  return grass;
}

function makeWater(arenaId: ArenaVisualDefinition['id']): THREE.Mesh {
  const geometry = new THREE.PlaneGeometry(960, 960, 96, 96);
  geometry.rotateX(-Math.PI / 2);
  geometry.translate(0, -19.5, 0);
  const material = new MeshStandardNodeMaterial({ transparent: true, opacity: 0.82, roughness: 0.27, metalness: 0.08, side: DoubleSide });
  const wave = sin(positionLocal.x.mul(0.12).add(time.mul(0.8)))
    .add(sin(positionLocal.z.mul(0.16).sub(time.mul(0.53))))
    .mul(0.1);
  material.positionNode = positionLocal.add(vec3(0, wave, 0));
  const shimmer = sin(positionWorld.x.add(positionWorld.z).mul(0.09).add(time.mul(0.45))).mul(0.5).add(0.5);
  material.colorNode = mix(color(0x173e4b), color(0x4b8993), shimmer);
  tagPipeline(material, PIPELINE.water);
  const water = new THREE.Mesh(geometry, material);
  water.name = 'Pass 64 TSL perimeter water';
  water.visible = arenaId === 'rustworks-1v1';
  water.receiveShadow = true;
  water.renderOrder = -5;
  water.frustumCulled = false;
  return water;
}

function configureHdrPipeline(
  renderPipeline: RenderPipeline,
  scene: THREE.Scene,
  camera: THREE.Camera,
  definition: ArenaVisualDefinition,
): Readonly<{ scenePass: ReturnType<typeof pass>; applyDefinition(next: ArenaVisualDefinition): void }> {
  const scenePass = pass(scene, camera, { samples: 4 });
  const sceneColor = scenePass.getTextureNode('output');
  const sceneDepth = scenePass.getTextureNode('depth');
  const saturation = uniform(definition.colorPipeline.grade.saturation);
  const contrast = uniform(definition.colorPipeline.grade.contrast);
  // Definition strength is authored in 8-bit output steps. Convert it before
  // adding the dither in linear HDR; using it as a 0-1 scalar creates noise.
  const grain = uniform(definition.colorPipeline.grain.strength / 255);
  const luma = dot(sceneColor.rgb, vec3(0.2126, 0.7152, 0.0722));
  const saturated = mix(vec3(luma), sceneColor.rgb, saturation);
  const contrasted = saturated.sub(0.5).mul(contrast).add(0.5);
  const orderedDither = fract(sin(dot(screenUV.mul(vec2(4096, 2160)), vec2(12.9898, 78.233))).mul(43758.5453))
    .sub(0.5)
    .mul(grain);
  const pixel = vec2(1).div(screenSize);
  const depthRight = sceneDepth.sample(screenUV.add(vec2(pixel.x, 0)));
  const depthUp = sceneDepth.sample(screenUV.add(vec2(0, pixel.y)));
  const depthDiscontinuity = max(abs(sceneDepth.sub(depthRight)), abs(sceneDepth.sub(depthUp)));
  // Suppress the blur at geometry depth discontinuities. This keeps emissive
  // energy on the visible side of roofs, walls and portal frames rather than
  // allowing the low-resolution bloom chain to smear across their silhouettes.
  const depthEdgeGuard = float(1).sub(smoothstep(0.00035, 0.0035, depthDiscontinuity));
  const emissiveBloom = bloom(sceneColor, 0.14, 0.32, 0.92);
  const hdrWithBloom = contrasted.add(emissiveBloom.rgb.mul(depthEdgeGuard));
  renderPipeline.outputNode = vec4(hdrWithBloom.add(orderedDither), sceneColor.a);
  renderPipeline.needsUpdate = true;
  return {
    scenePass,
    applyDefinition(next) {
      saturation.value = next.colorPipeline.grade.saturation;
      contrast.value = next.colorPipeline.grade.contrast;
      grain.value = next.colorPipeline.grain.strength / 255;
    },
  };
}

function disposeRoot(root: THREE.Group): void {
  const geometries = new Set<THREE.BufferGeometry>();
  const materials = new Set<THREE.Material>();
  root.traverse((node) => {
    const mesh = node as THREE.Mesh;
    if (mesh.geometry) geometries.add(mesh.geometry);
    const nodeMaterials = Array.isArray(mesh.material) ? mesh.material : mesh.material ? [mesh.material] : [];
    for (const material of nodeMaterials) materials.add(material);
  });
  root.removeFromParent();
  for (const geometry of geometries) geometry.dispose();
  for (const material of materials) material.dispose();
  root.clear();
}

export function createPass64TslSceneSystems(
  scene: THREE.Scene,
  camera: THREE.Camera,
  renderPipeline: RenderPipeline,
  definition: ArenaVisualDefinition,
): Pass64TslSceneSystems {
  const root = new THREE.Group();
  root.name = 'Pass 64 WebGPU TSL presentation systems';
  root.userData.pass64TslPresentation = true;
  root.add(
    makeSky(),
    makeMist(definition),
    makeSmoke(definition),
    makeDust(definition),
    makeGrass(definition.id),
    makeWater(definition.id),
  );
  scene.add(root);
  const hdr = configureHdrPipeline(renderPipeline, scene, camera, definition);
  const scenePass = hdr.scenePass;
  applyArenaSystemLayout(root, definition);
  const compiledPipelineIds = Object.freeze(TSL_MIGRATION_INVENTORY.map((entry) => entry.replacementPipelineId));
  return Object.freeze({
    root,
    principalHdrTarget: scenePass.renderTarget,
    bloomSamples: 0,
    depthAwareBloom: true,
    bloomGraphId: 'pass64.full-scene-depth-tested-bloom.v1',
    bloomOcclusionSource: 'authoritative-scene-depth',
    compiledPipelineIds,
    applyDefinition: (nextDefinition) => {
      applyArenaSystemLayout(root, nextDefinition);
      hdr.applyDefinition(nextDefinition);
    },
    dispose: () => {
      disposeRoot(root);
      scenePass.dispose();
    },
  });
}

export function auditRuntimeTslTraversal(
  scene: THREE.Scene,
  compiledPipelineIds: readonly string[],
): RuntimeTslTraversal {
  const legacyShaderMaterials: string[] = [];
  const nodeMaterialPipelineIds = new Set<string>();
  scene.traverse((node) => {
    const mesh = node as THREE.Mesh;
    const materials = Array.isArray(mesh.material) ? mesh.material : mesh.material ? [mesh.material] : [];
    for (const material of materials) {
      if (material instanceof THREE.ShaderMaterial || material instanceof THREE.RawShaderMaterial) {
        legacyShaderMaterials.push(`${node.name || node.type}:${material.name || material.type}`);
      }
      const pipelineId = material.userData.tslPipelineId;
      if (typeof pipelineId === 'string') nodeMaterialPipelineIds.add(pipelineId);
    }
  });
  return Object.freeze({
    legacyShaderMaterials: Object.freeze(legacyShaderMaterials.sort()),
    nodeMaterialPipelineIds: Object.freeze([...nodeMaterialPipelineIds].sort()),
    compiledPipelineIds: Object.freeze([...new Set(compiledPipelineIds)].sort()),
  });
}

export function assertRuntimeTslTraversal(audit: RuntimeTslTraversal): void {
  if (audit.legacyShaderMaterials.length > 0) {
    throw new Error(`WebGPU TSL review failed closed: legacy shader materials remain: ${audit.legacyShaderMaterials.join(', ')}`);
  }
  const expected = TSL_MIGRATION_INVENTORY.map((entry) => entry.replacementPipelineId).sort();
  const compiled = [...audit.compiledPipelineIds].sort();
  if (JSON.stringify(compiled) !== JSON.stringify(expected)) {
    throw new Error(`WebGPU TSL review failed closed: compiled pipeline ledger mismatch (${compiled.join(', ')})`);
  }
  const materialPipelines = new Set(audit.nodeMaterialPipelineIds);
  const missingMaterials = expected.filter((id) => id !== PIPELINE.hdr && !materialPipelines.has(id));
  if (missingMaterials.length > 0) {
    throw new Error(`WebGPU TSL review failed closed: node-material traversal missing ${missingMaterials.join(', ')}`);
  }
}
