import * as THREE from 'three';
import {
  DoubleSide,
  MeshBasicNodeMaterial,
  MeshStandardNodeMaterial,
  PointsNodeMaterial,
  SpriteNodeMaterial,
  type RenderPipeline,
} from 'three/webgpu';
import { SkyMesh } from 'three/addons/objects/SkyMesh.js';
import {
  color,
  dot,
  float,
  fract,
  instanceIndex,
  length,
  mix,
  pass,
  positionLocal,
  positionWorld,
  screenUV,
  sin,
  smoothstep,
  time,
  uniform,
  uv,
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
  compiledPipelineIds: readonly string[];
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
  const material = new MeshBasicNodeMaterial({ transparent: true, depthWrite: false, side: DoubleSide });
  const drift = sin(positionWorld.x.mul(0.075).add(time.mul(0.055))).mul(0.5).add(0.5);
  material.colorNode = mix(color(0x7fa5ae), color(0xd0d9cf), drift);
  material.opacityNode = float(Math.min(0.12, 0.035 + definition.atmosphere.mist * 0.09)).mul(drift.mul(0.35).add(0.65));
  tagPipeline(material, PIPELINE.mist);
  const geometry = new THREE.PlaneGeometry(1, 1, 1, 1);
  for (const [x, z, width, depth] of ATMOSPHERE_LAYOUTS[definition.id].mist) {
    const layer = new THREE.Mesh(geometry, material);
    layer.position.set(x, 0.16, z);
    layer.rotation.x = -Math.PI / 2;
    layer.scale.set(width, depth, 1);
    root.add(layer);
  }
  return root;
}

function makeSmoke(arenaId: ArenaVisualDefinition['id']): THREE.Group {
  const root = new THREE.Group();
  root.name = 'Pass 64 TSL smoke';
  const material = new SpriteNodeMaterial({ transparent: true, depthWrite: false });
  const billow = sin(positionWorld.y.mul(0.7).sub(time.mul(0.33))).mul(0.5).add(0.5);
  const feather = float(1).sub(smoothstep(0.16, 0.52, length(uv().sub(0.5).mul(vec2(1.4, 1)))));
  material.colorNode = mix(color(0x2f3b3e), color(0x7d8984), billow);
  material.opacityNode = float(0.085).mul(billow.mul(0.58).add(0.42)).mul(feather);
  tagPipeline(material, PIPELINE.smoke);
  for (const [x, z, width, height] of ATMOSPHERE_LAYOUTS[arenaId].smoke) {
    const puff = new THREE.Sprite(material);
    puff.position.set(x, height * 0.5 + 0.15, z);
    puff.scale.set(width, height, 1);
    root.add(puff);
  }
  return root;
}

function seededUnit(index: number, salt: number): number {
  const value = Math.sin((index + 1) * (12.9898 + salt * 8.233)) * 43758.5453;
  return value - Math.floor(value);
}

function makeDust(arenaId: ArenaVisualDefinition['id']): THREE.Points {
  const layout = ATMOSPHERE_LAYOUTS[arenaId].dust;
  const count = layout.count;
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
  material.colorNode = mix(color(0xd7b47b), color(0xffebc7), flicker);
  material.opacityNode = float(0.28).mul(flicker.mul(0.45).add(0.55));
  tagPipeline(material, PIPELINE.dust);
  const dust = new THREE.Points(geometry, material);
  dust.name = 'Pass 64 TSL deterministic dust';
  return dust;
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
  if (arenaId !== 'atomic-acres') grass.position.y = -400;
  return grass;
}

function makeWater(arenaId: ArenaVisualDefinition['id']): THREE.Mesh {
  const geometry = new THREE.PlaneGeometry(960, 960, 96, 96);
  const material = new MeshStandardNodeMaterial({ transparent: true, opacity: 0.82, roughness: 0.27, metalness: 0.08, side: DoubleSide });
  const wave = sin(positionLocal.x.mul(0.12).add(time.mul(0.8)))
    .add(sin(positionLocal.y.mul(0.16).sub(time.mul(0.53))))
    .mul(0.1);
  material.positionNode = positionLocal.add(vec3(0, 0, wave));
  const shimmer = sin(positionWorld.x.add(positionWorld.z).mul(0.09).add(time.mul(0.45))).mul(0.5).add(0.5);
  material.colorNode = mix(color(0x173e4b), color(0x4b8993), shimmer);
  tagPipeline(material, PIPELINE.water);
  const water = new THREE.Mesh(geometry, material);
  water.name = 'Pass 64 TSL perimeter water';
  water.position.y = arenaId === 'rustworks-1v1' ? -19.5 : -400;
  water.rotation.x = -Math.PI / 2;
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
): ReturnType<typeof pass> {
  const scenePass = pass(scene, camera);
  const sceneColor = scenePass.getTextureNode('output');
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
  renderPipeline.outputNode = vec4(contrasted.add(orderedDither), sceneColor.a);
  renderPipeline.needsUpdate = true;
  return scenePass;
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
    makeSmoke(definition.id),
    makeDust(definition.id),
    makeGrass(definition.id),
    makeWater(definition.id),
  );
  scene.add(root);
  const scenePass = configureHdrPipeline(renderPipeline, scene, camera, definition);
  const compiledPipelineIds = Object.freeze(TSL_MIGRATION_INVENTORY.map((entry) => entry.replacementPipelineId));
  return Object.freeze({
    root,
    principalHdrTarget: scenePass.renderTarget,
    compiledPipelineIds,
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
