import * as THREE from 'three';
import {
  DoubleSide,
  MeshStandardNodeMaterial,
  PointsNodeMaterial,
  type RenderPipeline,
} from 'three/webgpu';
import { SkyMesh } from 'three/addons/objects/SkyMesh.js';
import { ao } from 'three/addons/tsl/display/GTAONode.js';
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
  mrt,
  normalView,
  output,
  positionLocal,
  positionWorld,
  screenUV,
  screenSize,
  sin,
  smoothstep,
  uniform,
  vec2,
  vec3,
  vec4,
} from 'three/tsl';
import type { ArenaReviewCamera, ArenaVisualDefinition } from './arena-visual-definition';
import { createGrassPlacements } from '../grass-placement';
import { TSL_MIGRATION_INVENTORY } from './tsl-migration-inventory';
import type { GraphicsRuntime } from '../pass65-settings';

export type Pass65TslGraphicsOptions = Readonly<{
  principalSamples: 1 | 2 | 4;
  volumetricScale: number;
  ambientOcclusion: GraphicsRuntime['ambientOcclusion'];
  post: GraphicsRuntime['post'];
}>;

const DEFAULT_TSL_GRAPHICS_OPTIONS: Pass65TslGraphicsOptions = Object.freeze({
  principalSamples: 4,
  volumetricScale: 1,
  ambientOcclusion: Object.freeze({
    quality: 'off', enabled: false, resolutionScale: 0, samples: 0, radius: 0, strength: 0,
  }),
  post: Object.freeze({
    bloomStrength: 0.14,
    exposureScale: 1,
    toneMapping: 'aces',
    filmGrainScale: 1,
    vignetteStrength: 0,
  }),
});

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
  ambientOcclusion: Readonly<{
    graphId: 'pass65.webgpu-gtao-depth.v1';
    quality: GraphicsRuntime['ambientOcclusion']['quality'];
    enabled: boolean;
    resolutionScale: number;
    samples: number;
    radius: number;
    strength: number;
  }>;
  compiledPipelineIds: readonly string[];
  /**
   * Asynchronously compiles visible descendants against the exact principal
   * HDR target/MRT used by the live ScenePass. The caller still owns the final
   * forced RenderPipeline submission and completion fence.
   */
  precompileExactScenePass(root: THREE.Object3D): Promise<void>;
  applyDefinition(definition: ArenaVisualDefinition): void;
  setReviewCamera(camera: ArenaReviewCamera): void;
  clearReviewCamera(): void;
  update(timeMs: number): void;
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
    [[-21, -18, 13, 4.4], [20, 18, 13, 4.4], [0, -12, 9, 3], [23, -7, 8, 3.2], [-23, 8, 8, 3.2]],
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
const MAX_MIST_LAYERS = Math.max(...Object.values(ATMOSPHERE_LAYOUTS).map((layout) => layout.mist.length));

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

/**
 * Pass 66 painted sky layers. Deterministic, presentation-only dressing far
 * outside the arena bounds; per-preset visibility/tints are applied by
 * applyArenaSystemLayout. Materials ignore scene fog so the backdrop cannot
 * be washed out by the gameplay fog band.
 */
function skyDomePoint(index: number, seed: number, radius: number, minimumY: number): [number, number, number] {
  const theta = seededUnit(index, 1, seed) * Math.PI * 2;
  const y = minimumY + seededUnit(index, 2, seed) * (1 - minimumY);
  const horizontal = Math.sqrt(Math.max(0, 1 - y * y));
  return [Math.cos(theta) * horizontal * radius, y * radius, Math.sin(theta) * horizontal * radius];
}

function makeNightStars(): THREE.Points {
  const count = 900;
  const positions = new Float32Array(count * 3);
  for (let index = 0; index < count; index += 1) {
    const [x, y, z] = skyDomePoint(index, 6601, 396, 0.05);
    positions.set([x, y, z], index * 3);
  }
  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute('position', new THREE.BufferAttribute(positions, 3));
  const material = new THREE.PointsMaterial({
    name: 'pass66-night-stars', color: 0xf3f7ff, size: 1.35, sizeAttenuation: false,
    transparent: true, opacity: 0.9, depthWrite: false, fog: false,
  });
  const stars = new THREE.Points(geometry, material);
  stars.name = 'Pass 66 night stars';
  stars.frustumCulled = false;
  stars.visible = false;
  return stars;
}

function makeGalaxyBand(): THREE.Points {
  const count = 1_500;
  const positions = new Float32Array(count * 3);
  const colors = new Float32Array(count * 3);
  const bandTilt = 0.62;
  const core = new THREE.Color(0xcfd8ff);
  const dust = new THREE.Color(0x8f7bd8);
  for (let index = 0; index < count; index += 1) {
    // Concentrate along one tilted great-circle band with gaussian-ish spread.
    const along = (seededUnit(index, 1, 7702) - 0.5) * Math.PI * 1.9;
    const spread = (seededUnit(index, 2, 7702) + seededUnit(index, 3, 7702) - 1) * 0.16;
    const direction = new THREE.Vector3(Math.cos(along), Math.sin(along) * Math.sin(bandTilt) + spread, Math.sin(along) * Math.cos(bandTilt));
    direction.normalize();
    if (direction.y < 0.04) direction.y = 0.04 + Math.abs(spread);
    direction.normalize().multiplyScalar(392);
    positions.set([direction.x, direction.y, direction.z], index * 3);
    const tint = core.clone().lerp(dust, seededUnit(index, 4, 7702));
    colors.set([tint.r, tint.g, tint.b], index * 3);
  }
  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute('position', new THREE.BufferAttribute(positions, 3));
  geometry.setAttribute('color', new THREE.BufferAttribute(colors, 3));
  const material = new THREE.PointsMaterial({
    name: 'pass66-galaxy-band', vertexColors: true, size: 2.1, sizeAttenuation: false,
    transparent: true, opacity: 0.5, depthWrite: false, fog: false, blending: THREE.AdditiveBlending,
  });
  const galaxy = new THREE.Points(geometry, material);
  galaxy.name = 'Pass 66 galaxy band';
  galaxy.frustumCulled = false;
  galaxy.visible = false;
  return galaxy;
}

function makeAuroraCurtains(): THREE.Group {
  const group = new THREE.Group();
  group.name = 'Pass 66 aurora curtains';
  const palette = [0x3ef2a5, 0x39d7c9, 0x63e07f];
  for (const [index, hex] of palette.entries()) {
    const geometry = new THREE.PlaneGeometry(300 - index * 40, 74 - index * 10, 36, 1);
    const positionsAttr = geometry.getAttribute('position') as THREE.BufferAttribute;
    for (let vertex = 0; vertex < positionsAttr.count; vertex += 1) {
      const x = positionsAttr.getX(vertex);
      // Waved lower hem so the curtains read as ribbons, not billboards.
      positionsAttr.setZ(vertex, Math.sin(x * 0.045 + index * 1.7) * 14);
      if (positionsAttr.getY(vertex) < 0) {
        positionsAttr.setY(vertex, positionsAttr.getY(vertex) + Math.sin(x * 0.08 + index) * 9);
      }
    }
    positionsAttr.needsUpdate = true;
    geometry.computeVertexNormals();
    const material = new THREE.MeshBasicMaterial({
      name: `pass66-aurora-${index}`, color: hex, transparent: true, opacity: 0.16 + index * 0.04,
      depthWrite: false, fog: false, side: THREE.DoubleSide, blending: THREE.AdditiveBlending,
    });
    const curtain = new THREE.Mesh(geometry, material);
    curtain.name = `pass66-aurora-curtain-${index}`;
    curtain.position.set(-30 + index * 34, 168 + index * 26, -286 + index * 30);
    curtain.rotation.x = -0.28;
    curtain.frustumCulled = false;
    group.add(curtain);
  }
  group.visible = false;
  return group;
}

function makePaintedClouds(): THREE.Group {
  const group = new THREE.Group();
  group.name = 'Pass 66 painted clouds';
  const primary = new THREE.MeshBasicMaterial({
    name: 'pass66-cloud-primary', color: 0xffffff, transparent: true, opacity: 0.5,
    depthWrite: false, fog: false, side: THREE.DoubleSide,
  });
  const secondary = new THREE.MeshBasicMaterial({
    name: 'pass66-cloud-secondary', color: 0xe8f2f8, transparent: true, opacity: 0.42,
    depthWrite: false, fog: false, side: THREE.DoubleSide,
  });
  group.userData.primaryMaterial = primary;
  group.userData.secondaryMaterial = secondary;
  for (let index = 0; index < 10; index += 1) {
    const [x, y, z] = skyDomePoint(index, 8803, 330, 0.16);
    const width = 64 + seededUnit(index, 5, 8803) * 58;
    const cloud = new THREE.Mesh(
      new THREE.PlaneGeometry(width, width * 0.3, 1, 1),
      index % 2 === 0 ? primary : secondary,
    );
    cloud.name = `pass66-cloud-${index}`;
    cloud.position.set(x, Math.min(y, 176), z);
    cloud.lookAt(0, cloud.position.y * 0.7, 0);
    cloud.frustumCulled = false;
    cloud.userData.cloudOrdinal = index;
    group.add(cloud);
  }
  group.visible = false;
  return group;
}

function makeMist(definition: ArenaVisualDefinition): THREE.Group {
  const root = new THREE.Group();
  root.name = 'Pass 64 TSL mist';
  const material = new PointsNodeMaterial({ transparent: true, depthWrite: false, size: 0.34, sizeAttenuation: true });
  const animationTime = uniform(0);
  const drift = sin(positionWorld.x.mul(0.075).add(animationTime.mul(0.055))).mul(0.5).add(0.5);
  const mistStrength = uniform(Math.min(0.12, 0.035 + definition.atmosphere.mist * 0.09));
  material.colorNode = mix(color(0x7fa5ae), color(0xd0d9cf), drift);
  material.opacityNode = mistStrength.mul(drift.mul(0.35).add(0.65));
  tagPipeline(material, PIPELINE.mist);
  root.userData.opacityUniform = mistStrength;
  root.userData.animationTimeUniform = animationTime;
  const positions = new Float32Array(48 * 3);
  for (let index = 0; index < 48; index += 1) {
    positions[index * 3] = seededUnit(index, 11) - 0.5;
    positions[index * 3 + 1] = seededUnit(index, 12) * 0.8;
    positions[index * 3 + 2] = seededUnit(index, 13) - 0.5;
  }
  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute('position', new THREE.BufferAttribute(positions, 3));
  for (let index = 0; index < MAX_MIST_LAYERS; index += 1) {
    const placement = ATMOSPHERE_LAYOUTS[definition.id].mist[index];
    const layer = new THREE.Points(geometry, material);
    layer.visible = placement !== undefined;
    if (placement) {
      const [x, z, width, depth] = placement;
      layer.position.set(x, 0.08, z);
      layer.scale.set(width, 0.85, depth);
    }
    root.add(layer);
  }
  return root;
}

function makeSmoke(definition: ArenaVisualDefinition): THREE.Group {
  const root = new THREE.Group();
  root.name = 'Pass 64 TSL smoke';
  const material = new PointsNodeMaterial({ transparent: true, depthWrite: false, size: 0.46, sizeAttenuation: true });
  const animationTime = uniform(0);
  const billow = sin(positionWorld.y.mul(0.7).sub(animationTime.mul(0.33))).mul(0.5).add(0.5);
  const smokeStrength = uniform(0.035 + definition.atmosphere.mist * 0.12);
  material.colorNode = mix(color(0x2f3b3e), color(0x7d8984), billow);
  material.opacityNode = smokeStrength.mul(billow.mul(0.58).add(0.42));
  tagPipeline(material, PIPELINE.smoke);
  root.userData.opacityUniform = smokeStrength;
  root.userData.animationTimeUniform = animationTime;
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

function seededUnit(index: number, salt: number, seed = 6401): number {
  const value = Math.sin((index + 1 + seed * 0.001) * (12.9898 + salt * 8.233)) * 43758.5453;
  return value - Math.floor(value);
}

function makeDust(definition: ArenaVisualDefinition): THREE.Points {
  const layout = ATMOSPHERE_LAYOUTS[definition.id].dust;
  const seed = definition.reviewCameras[0]?.seed ?? 6401;
  const count = Math.max(...Object.values(ATMOSPHERE_LAYOUTS).map((entry) => entry.dust.count));
  const positions = new Float32Array(count * 3);
  for (let index = 0; index < count; index += 1) {
    positions[index * 3] = layout.minX + seededUnit(index, 1, seed) * (layout.maxX - layout.minX);
    positions[index * 3 + 1] = 0.4 + seededUnit(index, 2, seed) * 16;
    positions[index * 3 + 2] = layout.minZ + seededUnit(index, 3, seed) * (layout.maxZ - layout.minZ);
  }
  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute('position', new THREE.BufferAttribute(positions, 3));
  const material = new PointsNodeMaterial({ transparent: true, depthWrite: false, size: 1 });
  const animationTime = uniform(0);
  const flicker = sin(animationTime.mul(0.7).add(positionWorld.x.mul(0.21))).mul(0.5).add(0.5);
  const dustStrength = uniform(Math.min(0.32, 0.08 + definition.atmosphere.dust * 0.72));
  material.colorNode = mix(color(0xd7b47b), color(0xffebc7), flicker);
  material.opacityNode = dustStrength.mul(flicker.mul(0.45).add(0.55));
  tagPipeline(material, PIPELINE.dust);
  const dust = new THREE.Points(geometry, material);
  dust.name = 'Pass 64 TSL deterministic dust';
  dust.userData.opacityUniform = dustStrength;
  dust.userData.animationTimeUniform = animationTime;
  geometry.setDrawRange(0, layout.count);
  return dust;
}

function applyArenaSystemLayout(
  root: THREE.Group,
  definition: ArenaVisualDefinition,
  seed = definition.reviewCameras[0]?.seed ?? 6401,
  graphics: Pass65TslGraphicsOptions = DEFAULT_TSL_GRAPHICS_OPTIONS,
): void {
  const layout = ATMOSPHERE_LAYOUTS[definition.id];
  const volumetricScale = THREE.MathUtils.clamp(graphics.volumetricScale, 0.35, 1);
  const mist = root.getObjectByName('Pass 64 TSL mist');
  const mistUniform = mist?.userData.opacityUniform as { value: number } | undefined;
  if (mistUniform) mistUniform.value = Math.min(0.12, 0.035 + definition.atmosphere.mist * 0.09) * volumetricScale;
  const visibleMistLayers = Math.max(1, Math.ceil(layout.mist.length * volumetricScale));
  mist?.children.forEach((node, index) => {
    const placement = layout.mist[index];
    node.visible = placement !== undefined && index < visibleMistLayers;
    if (placement) {
      const [x, z, width, depth] = placement;
      node.position.set(x, 0.08, z);
      node.scale.set(width, 0.85, depth);
    }
  });
  const smoke = root.getObjectByName('Pass 64 TSL smoke');
  const smokeUniform = smoke?.userData.opacityUniform as { value: number } | undefined;
  if (smokeUniform) smokeUniform.value = (0.035 + definition.atmosphere.mist * 0.12) * volumetricScale;
  const visibleSmokeLayers = Math.max(1, Math.ceil(layout.smoke.length * volumetricScale));
  smoke?.children.forEach((node, index) => {
    const placement = layout.smoke[index];
    node.visible = placement !== undefined && index < visibleSmokeLayers;
    if (placement) {
      const [x, z, width, height] = placement;
      node.position.set(x, height * 0.5 + 0.15, z);
      node.scale.set(width, height, width);
    }
  });
  const dust = root.getObjectByName('Pass 64 TSL deterministic dust') as THREE.Points | undefined;
  const dustUniform = dust?.userData.opacityUniform as { value: number } | undefined;
  if (dustUniform) dustUniform.value = Math.min(0.32, 0.08 + definition.atmosphere.dust * 0.72) * volumetricScale;
  const positions = dust?.geometry.getAttribute('position') as THREE.BufferAttribute | undefined;
  if (dust && positions) {
    for (let index = 0; index < positions.count; index += 1) {
      positions.setXYZ(
        index,
        layout.dust.minX + seededUnit(index, 1, seed) * (layout.dust.maxX - layout.dust.minX),
        0.4 + seededUnit(index, 2, seed) * 16,
        layout.dust.minZ + seededUnit(index, 3, seed) * (layout.dust.maxZ - layout.dust.minZ),
      );
    }
    positions.needsUpdate = true;
    dust.geometry.setDrawRange(0, Math.max(1, Math.round(layout.dust.count * volumetricScale)));
  }
  const grass = root.getObjectByName('Pass 64 TSL grass');
  if (grass) grass.visible = definition.id === 'atomic-acres';
  const water = root.getObjectByName('Pass 64 TSL perimeter water');
  if (water) water.visible = definition.id === 'rustworks-1v1';
  const sky = root.getObjectByName('Pass 64 TSL atmosphere sky') as SkyMesh | undefined;
  const preset = definition.atmosphere.preset;
  if (sky) {
    sky.turbidity.value = definition.atmosphere.clouds ? 4.2 : 1.2;
    sky.rayleigh.value = definition.atmosphere.clouds ? 1.75 : 0.85;
    // Owner-directed per-arena skies: RustRig is true night, Atomic Acres is a
    // deep sunset carrying orange/purple cloud paint, Terminal is plain day.
    if (preset === 'industrial-night') sky.sunPosition.value.set(0.3, -0.16, -0.35).normalize();
    else if (preset === 'sunset-farmland') sky.sunPosition.value.set(0.62, 0.11, -0.3).normalize();
    else sky.sunPosition.value.set(0.45, 0.72, -0.22).normalize();
  }
  const nightLayersVisible = preset === 'industrial-night';
  const stars = root.getObjectByName('Pass 66 night stars');
  if (stars) stars.visible = nightLayersVisible;
  const galaxy = root.getObjectByName('Pass 66 galaxy band');
  if (galaxy) galaxy.visible = nightLayersVisible;
  const aurora = root.getObjectByName('Pass 66 aurora curtains');
  if (aurora) aurora.visible = nightLayersVisible;
  const clouds = root.getObjectByName('Pass 66 painted clouds') as THREE.Group | undefined;
  if (clouds) {
    clouds.visible = preset === 'sunset-farmland' || preset === 'airport-dawn';
    const primary = clouds.userData.primaryMaterial as THREE.MeshBasicMaterial;
    const secondary = clouds.userData.secondaryMaterial as THREE.MeshBasicMaterial;
    if (preset === 'sunset-farmland') {
      primary.color.setHex(0xff934a);
      secondary.color.setHex(0x9f6fe8);
      primary.opacity = 0.55;
      secondary.opacity = 0.48;
    } else {
      primary.color.setHex(0xffffff);
      secondary.color.setHex(0xe9f3f9);
      primary.opacity = 0.5;
      secondary.opacity = 0.42;
    }
    // Terminal reads "half sun half cloud": show only half of the bank.
    clouds.children.forEach((cloud, index) => {
      cloud.visible = preset !== 'airport-dawn' || index % 2 === 0;
    });
  }
  root.userData.tslArenaVisualDefinitionId = definition.id;
  root.userData.tslAtmosphere = { ...definition.atmosphere };
  root.userData.tslVolumetricScale = volumetricScale;
  root.userData.tslReviewSeed = seed;
}

function makeGrass(arenaId: ArenaVisualDefinition['id']): THREE.InstancedMesh {
  const placements = createGrassPlacements([], 180).placements;
  const geometry = new THREE.PlaneGeometry(1, 1, 1, 3);
  geometry.translate(0, 0.5, 0);
  const material = new MeshStandardNodeMaterial({ side: DoubleSide, roughness: 0.92, metalness: 0 });
  const animationTime = uniform(0);
  const wind = sin(animationTime.mul(1.35).add(float(instanceIndex).mul(0.73))).mul(positionLocal.y).mul(0.045);
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
  grass.userData.animationTimeUniform = animationTime;
  return grass;
}

function makeWater(arenaId: ArenaVisualDefinition['id']): THREE.Mesh {
  const geometry = new THREE.PlaneGeometry(960, 960, 96, 96);
  geometry.rotateX(-Math.PI / 2);
  geometry.translate(0, -19.5, 0);
  const material = new MeshStandardNodeMaterial({ transparent: true, opacity: 0.82, roughness: 0.27, metalness: 0.08, side: DoubleSide });
  const animationTime = uniform(0);
  const wave = sin(positionLocal.x.mul(0.12).add(animationTime.mul(0.8))).mul(0.085)
    .add(sin(positionLocal.z.mul(0.16).sub(animationTime.mul(0.53))).mul(0.07))
    .add(sin(positionLocal.x.mul(0.07).add(positionLocal.z.mul(0.11)).add(animationTime.mul(0.31))).mul(0.045));
  material.positionNode = positionLocal.add(vec3(0, wave, 0));
  const shimmer = sin(positionWorld.x.add(positionWorld.z).mul(0.09).add(animationTime.mul(0.45))).mul(0.5).add(0.5);
  material.colorNode = mix(color(0x173e4b), color(0x4b8993), shimmer);
  tagPipeline(material, PIPELINE.water);
  const water = new THREE.Mesh(geometry, material);
  water.name = 'Pass 64 TSL perimeter water';
  water.visible = arenaId === 'rustworks-1v1';
  water.receiveShadow = true;
  water.renderOrder = -5;
  water.frustumCulled = false;
  water.userData.animationTimeUniform = animationTime;
  water.userData.waveBands = 3;
  water.userData.waveAuthority = 'presentation-only-tsl';
  return water;
}

function setAnimationTime(root: THREE.Group, timeMs: number): void {
  for (const name of [
    'Pass 64 TSL mist',
    'Pass 64 TSL smoke',
    'Pass 64 TSL deterministic dust',
    'Pass 64 TSL grass',
    'Pass 64 TSL perimeter water',
  ]) {
    const uniformNode = root.getObjectByName(name)?.userData.animationTimeUniform as { value?: number } | undefined;
    if (uniformNode) uniformNode.value = timeMs / 1_000;
  }
  root.userData.tslReviewTimeMs = timeMs;
}

function configureHdrPipeline(
  renderPipeline: RenderPipeline,
  scene: THREE.Scene,
  camera: THREE.Camera,
  definition: ArenaVisualDefinition,
  graphics: Pass65TslGraphicsOptions,
): Readonly<{
  scenePass: ReturnType<typeof pass>;
  applyDefinition(next: ArenaVisualDefinition): void;
  dispose(): void;
}> {
  const scenePass = pass(scene, camera, { samples: graphics.principalSamples });
  if (graphics.ambientOcclusion.enabled) scenePass.setMRT(mrt({ output, normal: normalView }));
  const sceneColor = scenePass.getTextureNode('output');
  const sceneDepth = scenePass.getTextureNode('depth');
  const sceneNormal = graphics.ambientOcclusion.enabled ? scenePass.getTextureNode('normal') : null;
  const gtaoPass = sceneNormal ? ao(sceneDepth, sceneNormal, camera) : null;
  if (gtaoPass) {
    gtaoPass.resolutionScale = graphics.ambientOcclusion.resolutionScale;
    gtaoPass.samples.value = graphics.ambientOcclusion.samples;
    gtaoPass.radius.value = graphics.ambientOcclusion.radius;
    gtaoPass.scale.value = 0.5;
    gtaoPass.thickness.value = 1;
    gtaoPass.distanceExponent.value = 1;
    gtaoPass.distanceFallOff.value = 1;
    gtaoPass.useTemporalFiltering = false;
  }
  const saturation = uniform(definition.colorPipeline.grade.saturation);
  const contrast = uniform(definition.colorPipeline.grade.contrast);
  // Definition strength is authored in 8-bit output steps. Convert it before
  // adding the dither in linear HDR; using it as a 0-1 scalar creates noise.
  const grain = uniform(definition.colorPipeline.grain.strength / 255 * graphics.post.filmGrainScale);
  const vignette = uniform(graphics.post.vignetteStrength);
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
  const emissiveBloom = bloom(sceneColor, graphics.post.bloomStrength, 0.32, 0.92);
  const contactOcclusion = gtaoPass
    ? mix(float(1), gtaoPass.getTextureNode().r, float(graphics.ambientOcclusion.strength))
    : float(1);
  const hdrWithBloom = contrasted.mul(contactOcclusion).add(emissiveBloom.rgb.mul(depthEdgeGuard));
  const vignetteDistance = dot(screenUV.sub(0.5), screenUV.sub(0.5));
  const vignetteFalloff = smoothstep(0.12, 0.5, vignetteDistance).mul(vignette).mul(0.42);
  const postColor = hdrWithBloom.add(orderedDither).mul(float(1).sub(vignetteFalloff));
  renderPipeline.outputNode = vec4(postColor, sceneColor.a);
  renderPipeline.needsUpdate = true;
  return {
    scenePass,
    applyDefinition(next) {
      saturation.value = next.colorPipeline.grade.saturation;
      contrast.value = next.colorPipeline.grade.contrast;
      grain.value = next.colorPipeline.grain.strength / 255 * graphics.post.filmGrainScale;
    },
    dispose() {
      gtaoPass?.dispose();
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
  graphics: Pass65TslGraphicsOptions = DEFAULT_TSL_GRAPHICS_OPTIONS,
): Pass64TslSceneSystems {
  let activeDefinition = definition;
  let activeReviewCamera: ArenaReviewCamera | null = null;
  const root = new THREE.Group();
  root.name = 'Pass 64 WebGPU TSL presentation systems';
  root.userData.pass64TslPresentation = true;
  root.add(
    makeSky(),
    makeNightStars(),
    makeGalaxyBand(),
    makeAuroraCurtains(),
    makePaintedClouds(),
    makeMist(definition),
    makeSmoke(definition),
    makeDust(definition),
    makeGrass(definition.id),
    makeWater(definition.id),
  );
  scene.add(root);
  const hdr = configureHdrPipeline(renderPipeline, scene, camera, definition, graphics);
  const scenePass = hdr.scenePass;
  applyArenaSystemLayout(root, definition, definition.reviewCameras[0]?.seed ?? 6401, graphics);
  root.userData.pass65AdvancedGraphics = {
    principalSamples: graphics.principalSamples,
    volumetricScale: graphics.volumetricScale,
    bloomStrength: graphics.post.bloomStrength,
    filmGrainScale: graphics.post.filmGrainScale,
    vignetteStrength: graphics.post.vignetteStrength,
    ambientOcclusion: Object.freeze({ ...graphics.ambientOcclusion }),
  };
  setAnimationTime(root, 0);
  const compiledPipelineIds = Object.freeze(TSL_MIGRATION_INVENTORY.map((entry) => entry.replacementPipelineId));
  return Object.freeze({
    root,
    principalHdrTarget: scenePass.renderTarget,
    bloomSamples: 0,
    depthAwareBloom: true,
    bloomGraphId: 'pass64.full-scene-depth-tested-bloom.v1',
    bloomOcclusionSource: 'authoritative-scene-depth',
    ambientOcclusion: Object.freeze({
      graphId: 'pass65.webgpu-gtao-depth.v1',
      ...graphics.ambientOcclusion,
    }),
    compiledPipelineIds,
    precompileExactScenePass: async (precompileRoot) => {
      let attachmentRoot = precompileRoot;
      while (attachmentRoot.parent) attachmentRoot = attachmentRoot.parent;
      if (attachmentRoot !== scene) {
        throw new Error('Pass 64 exact ScenePass precompile root must be attached to the submitted scene');
      }
      const renderer = renderPipeline.renderer;
      const previousRenderTarget = renderer.getRenderTarget();
      const previousMrt = renderer.getMRT();
      renderer.setRenderTarget(scenePass.renderTarget);
      renderer.setMRT(scenePass.getMRT());
      try {
        // Three r185 yields between node shader stages and render objects here,
        // avoiding one monolithic first RenderPipeline encoding task. Binding
        // the ScenePass target and MRT preserves the live pipeline cache keys;
        // a default-canvas compile would not warm the HDR/MRT path.
        await renderer.compileAsync(precompileRoot, camera, scene);
      } finally {
        renderer.setRenderTarget(previousRenderTarget);
        renderer.setMRT(previousMrt);
      }
    },
    applyDefinition: (nextDefinition) => {
      activeDefinition = nextDefinition;
      activeReviewCamera = null;
      delete root.userData.tslReviewCameraId;
      applyArenaSystemLayout(root, nextDefinition, nextDefinition.reviewCameras[0]?.seed ?? 6401, graphics);
      hdr.applyDefinition(nextDefinition);
    },
    setReviewCamera: (reviewCamera) => {
      activeReviewCamera = reviewCamera;
      applyArenaSystemLayout(root, activeDefinition, reviewCamera.seed, graphics);
      setAnimationTime(root, reviewCamera.fixedTimeMs);
      root.userData.tslReviewCameraId = reviewCamera.id;
    },
    clearReviewCamera: () => {
      activeReviewCamera = null;
      delete root.userData.tslReviewCameraId;
    },
    update: (timeMs) => {
      setAnimationTime(root, activeReviewCamera?.fixedTimeMs ?? timeMs);
    },
    dispose: () => {
      disposeRoot(root);
      hdr.dispose();
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
