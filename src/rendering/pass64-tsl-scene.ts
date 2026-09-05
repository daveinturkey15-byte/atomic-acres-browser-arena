import * as THREE from 'three';
import {
  DoubleSide,
  MeshStandardNodeMaterial,
  PointsNodeMaterial,
  type Node,
  type RenderPipeline,
  type WebGPURenderer,
} from 'three/webgpu';
import { SkyMesh } from 'three/addons/objects/SkyMesh.js';
import { ao } from 'three/addons/tsl/display/GTAONode.js';
import { bloom } from 'three/addons/tsl/display/BloomNode.js';
import { denoise } from 'three/addons/tsl/display/DenoiseNode.js';
import {
  abs,
  color,
  dot,
  float,
  metalness,
  nodeObject,
  instanceIndex,
  mix,
  max,
  pass,
  mrt,
  normalView,
  output,
  positionLocal,
  positionWorld,
  roughness,
  screenUV,
  screenSize,
  sin,
  smoothstep,
  uniform,
  vec2,
  vec3,
  vec4,
  velocity,
} from 'three/tsl';
import type { ArenaReviewCamera, ArenaVisualDefinition } from './arena-visual-definition';
import { createGrassPlacements } from '../grass-placement';
import { TSL_MIGRATION_INVENTORY } from './tsl-migration-inventory';
import type { GraphicsRuntime } from '../pass65-settings';
// HF-358: WebGPU water presentation comes from the ocean-tsl factory driven by
// the shared frozen ocean-spectrum band table — one table for CPU buoyancy and
// GPU surface. Arena gating comes from the water-authoring registry, not a
// hard-coded rustworks check.
import { createOceanTslWater, oceanAmplitudeForBody } from '../water/ocean-tsl';
import { sharedWaterBodyForArena } from '../water/water-authoring';
import {
  applyArenaEnvironmentIbl,
  observeArenaEnvironment,
  type ArenaEnvironmentObservation,
  type ArenaIblState,
} from './arena-environment-ibl';
// HF-364: the screen-space raymarched stack (volumetric shafts, SSR, SSGI,
// depth of field, motion blur). The tier tables and the combat-safety proofs
// live in screen-space-post-profile.ts; the node graph lives in
// screen-space-post.ts. Nothing here is ray tracing - WebGPU exposes no
// ray-tracing pipeline in any browser - and the labels say so.
import {
  buildScreenSpacePostGraph,
  packedMaterialMrtNode,
  screenSpaceMrtRequirement,
  screenSpacePostStages,
  type ScreenSpacePostGraph,
} from './screen-space-post';
import {
  adaptScreenSpacePostForPressure,
  SCREEN_SPACE_POST_DISABLED,
} from './screen-space-post-profile';
// Lane L — per-arena art direction. The scene assembler owns two of its three
// consumption points: the pre-tone-map scene grade uniforms and the
// atmosphere particle mood; the third (the display grade composition) is
// pushed into the installed filmic chain on every arena definition apply.
import {
  artDirectionForArena,
  composeArtDirectedSceneGrade,
} from './art-direction';
import { installedFilmicGradeChain } from './filmic-grade-chain';

export type Pass65TslGraphicsOptions = Readonly<{
  principalSamples: 1 | 2 | 4;
  volumetricScale: number;
  ambientOcclusion: GraphicsRuntime['ambientOcclusion'];
  post: GraphicsRuntime['post'];
  oceanWaveAmplitude?: number;
  reflectionScale: number;
  reflectionQuality: 'off' | 'low' | 'high' | 'ultra';
  environmentIntensity: number;
  screenSpace?: GraphicsRuntime['screenSpace'];
}>;

const DEFAULT_TSL_GRAPHICS_OPTIONS: Pass65TslGraphicsOptions = Object.freeze({
  principalSamples: 4,
  volumetricScale: 1,
  ambientOcclusion: Object.freeze({
    quality: 'off', enabled: false, resolutionScale: 0, samples: 0, radius: 0, strength: 0, denoise: false,
  }),
  post: Object.freeze({
    bloomStrength: 0.14,
    exposureScale: 1,
    toneMapping: 'aces',
    filmGrainScale: 1,
    vignetteStrength: 0,
    sharpness: 0,
  }),
  reflectionScale: 1,
  reflectionQuality: 'high',
  environmentIntensity: 1,
  screenSpace: SCREEN_SPACE_POST_DISABLED,
});

/**
 * The linear-side stage receipt this assembler will build for one set of
 * options, without building a single node.
 *
 * The filmic grade chain's order contract covers the whole list — scene pass,
 * the optional screen-space stages, occlusion, bloom, then the display half —
 * so the chain has to be told which optional linear stages exist BEFORE the
 * assembler publishes an outputNode. Otherwise the first published receipt
 * would describe a graph that is not the one on screen.
 */
export function pass64LinearSourceStages(
  graphics: Pass65TslGraphicsOptions = DEFAULT_TSL_GRAPHICS_OPTIONS,
  // HF-401: when the graph exists, pass the stages it ACTUALLY BUILT. The
  // options alone cannot answer whether the shaft stage is in the chain,
  // because that also depends on the committed arena's sun casting shadows.
  // Callers that run before the graph exists (the pre-seed in legacy-main) omit
  // it and get the request, which is the best answer available at that point.
  builtOptionalStages?: readonly string[],
): readonly string[] {
  const screenSpace = graphics.screenSpace ?? SCREEN_SPACE_POST_DISABLED;
  const optional = builtOptionalStages ?? screenSpacePostStages(screenSpace);
  const stages = ['scene-pass-linear-hdr'];
  if (optional.includes('motion-blur-velocity-smear')) stages.push('motion-blur-velocity-smear');
  // HF-418. Derived from LINEAR_SOURCE_STAGE_ORDER rather than appended by
  // hand, because that is how the ray-traced stage came to be missing from this
  // receipt for three passes: it is in the frozen order and in the graph's own
  // `stages()`, and this hand-written enumeration simply never learned about
  // it. Both are restored here; the loop below is the fix that stops the next
  // one happening.
  if (optional.includes('baked-indirect-probe-add')) stages.push('baked-indirect-probe-add');
  if (optional.includes('ssgi-screen-space-bounce-add')) stages.push('ssgi-screen-space-bounce-add');
  stages.push('contact-occlusion-multiply');
  if (optional.includes('ssr-screen-space-reflection-add')) stages.push('ssr-screen-space-reflection-add');
  if (optional.includes('raytraced-reflection-refraction-add')) stages.push('raytraced-reflection-refraction-add');
  // HF-481. Aerial perspective sits with the reflections and the shafts, after
  // the occlusion multiply and before the bloom: haze is volume in front of the
  // surface (so GTAO must not darken it) and a bright hazy far field does bloom.
  if (optional.includes('aerial-perspective-inscatter-add')) stages.push('aerial-perspective-inscatter-add');
  stages.push('depth-guarded-bloom-add');
  if (optional.includes('godrays-volumetric-shaft-add')) stages.push('godrays-volumetric-shaft-add');
  if (optional.includes('depth-of-field-bokeh')) stages.push('depth-of-field-bokeh');
  return Object.freeze(stages);
}

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
  /**
   * HF-364 — the screen-space stack that is actually built into this graph.
   * Reported rather than requested: a tier the capability gate refused (shafts
   * without shadows) resolves to disabled here, so telemetry cannot claim it.
   */
  screenSpace: GraphicsRuntime['screenSpace'];
  /** Re-anchors the existing atmosphere uniforms without rebuilding the graph. */
  setAtmosphere(skyColor: THREE.Color, sunWhite: number): void;
  /**
   * Linear-side stage receipt for the filmic grade chain's order contract,
   * including the optional screen-space stages this graph built.
   */
  linearSourceStages: readonly string[];
  /**
   * Adaptive-quality pressure valve. Live uniforms and march resolutions only:
   * removing a pass entirely is a topology change and stays on the declared
   * pipeline-rebuild path.
   */
  setAdaptiveScreenSpaceBudget(pixelRatioCap: number, requestedPixelRatioCap: number): void;
  compiledPipelineIds: readonly string[];
  /**
   * Asynchronously compiles visible descendants against the exact principal
   * HDR target/MRT used by the live ScenePass. The caller still owns the final
   * forced RenderPipeline submission and completion fence.
   */
  precompileExactScenePass(root: THREE.Object3D): Promise<void>;
  applyDefinition(definition: ArenaVisualDefinition): Promise<void>;
  /**
   * Generates (or refreshes) the arena's PMREM environment against whatever sky
   * backdrop is mounted right now, and binds it to `scene.environment`.
   *
   * This exists as its own entry point because the first arena of every page
   * load does not go through `applyDefinition` at all - it is the arena that
   * CONSTRUCTS this object, so the `else` branch in legacy-main ran the
   * constructor and the only PMREM call site sat inside `applyDefinition`.
   * The result was `scene.environment === null` for the whole of map 1 on every
   * session, and non-null from map 2 onward: the same build lighting the map
   * every player actually plays differently from the one they switch to.
   *
   * The caller drives it AFTER `waitForSkyBackdropAdmission`, so the
   * environment is convolved from the arena's admitted sky rather than from
   * the procedural placeholder that goes in synchronously ahead of it.
   */
  applyArenaEnvironment(): Promise<void>;
  /** The live `scene.environment` receipt, read off the scene, for the first-arena gate. */
  observeArenaEnvironment(): ArenaEnvironmentObservation;
  /** Applies values backed by existing uniforms/scene nodes; target topology is unchanged. */
  applyGraphics(graphics: Pass65TslGraphicsOptions): Promise<void>;
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
  // HF-359 (Pass 74): farcrysis review layout ported from the Pass 69 hidden lane.
  'farcrysis': atmosphereLayout(
    [[-26, -26, 12, 4.0], [26, 26, 12, 4.0], [-8, -14, 10, 3.2], [0, -26, 12, 3.4]],
    [[-20, -20, 2.2, 4.0], [20, 20, 2.2, 4.0], [0, -18, 2.4, 4.4], [0, 0, 2.6, 5.0]],
    { count: 72, minX: -31, maxX: 31, minZ: -31, maxZ: 31 },
  ),
  'high-seas': atmosphereLayout(
    [[-10, -31, 11, 3.2], [10, 24, 10, 3], [0, 0, 8, 2.6]],
    [[-7, -25, 2, 3.6], [7, 20, 2, 3.6]],
    { count: 48, minX: -14, maxX: 14, minZ: -44, maxZ: 44 },
  ),
  // Test1: dry outdoor range — low mist over the firing lanes, dust across
  // the whole 52x38 ground.
  'test1': atmosphereLayout(
    [[-18, -10, 10, 3.2], [18, 10, 10, 3.2], [0, -14, 9, 2.8]],
    [[-14, 8, 2, 3.6], [14, -8, 2, 3.6]],
    { count: 56, minX: -26, maxX: 26, minZ: -19, maxZ: 19 },
  ),
  // Test2: hillside mansion — soft garden haze at the terraces, light pollen
  // dust across the 64x48 grounds.
  'test2': atmosphereLayout(
    [[-22, -16, 12, 3.6], [22, 16, 12, 3.6], [0, 0, 9, 2.8], [0, -20, 10, 3.0]],
    [[-18, 14, 2.2, 3.8], [18, -14, 2.2, 3.8]],
    { count: 48, minX: -32, maxX: 32, minZ: -24, maxZ: 24 },
  ),
  // MAP3 (PREVIEW): mirrors ATMOSPHERE_LAYOUTS in atmosphere-system.ts - mist
  // in the wedges, not in the bays - and a dust box that covers the hub and the
  // inner half of every bay, which is where a player actually is.
  'map3': atmosphereLayout(
    [[26, 26, 16, 4.4], [-26, -26, 16, 4.4], [-26, 26, 14, 4.0], [26, -26, 14, 4.0]],
    [[-40, 12, 2.4, 4.2], [40, -12, 2.4, 4.2]],
    { count: 56, minX: -46, maxX: 46, minZ: -46, maxZ: 46 },
  ),
  // NUKETOWN2 (PREVIEW, HF-407): the review layout mirrors ATMOSPHERE_LAYOUTS
  // in atmosphere-system.ts - yards and cul-de-sacs, never the road. The dust
  // box is the playable rectangle, which is where the players are.
  'nuketown2': atmosphereLayout(
    [[-14, -19, 11, 3.4], [14, 19, 11, 3.4], [-24, -2, 9, 3.0], [24, 2, 9, 3.0]],
    [[-20, -21, 2.2, 3.8], [20, 21, 2.2, 3.8]],
    { count: 56, minX: -29, maxX: 29, minZ: -26, maxZ: 26 },
  ),
  // RAID2 (PREVIEW, HF-408): mirrors ATMOSPHERE_LAYOUTS in atmosphere-system.ts
  // card for card, and a dust box that covers the three lanes rather than the
  // whole 100 x 76 box, because the spawn aprons are where nobody lingers.
  'raid2': atmosphereLayout(
    [[-27, -28, 13, 3.4], [8, -28, 13, 3.4], [0, -12, 11, 3.0], [0, 12, 12, 3.2]],
    [[-24, 20, 2.3, 3.9], [24, 20, 2.3, 3.9]],
    { count: 52, minX: -36, maxX: 36, minZ: -32, maxZ: 30 },
  ),
});
const MAX_MIST_LAYERS = Math.max(...Object.values(ATMOSPHERE_LAYOUTS).map((layout) => layout.mist.length));

function tagPipeline(material: THREE.Material, pipelineId: string): void {
  material.userData.tslPipelineId = pipelineId;
}

function makeSky(): THREE.Object3D {
  const sky = new SkyMesh();
  sky.name = 'Pass 64 TSL atmosphere sky';
  // The gameplay camera's far plane is 180 m. A 420 m dome was entirely outside
  // the frustum, so no sky reached the framebuffer on any arena.
  sky.scale.setScalar(174);
  sky.turbidity.value = 4.2;
  sky.rayleigh.value = 1.75;
  sky.mieCoefficient.value = 0.004;
  sky.mieDirectionalG.value = 0.78;
  sky.sunPosition.value.set(0.45, 0.72, -0.22).normalize();
  const opacity = uniform(1);
  sky.material.transparent = true;
  sky.material.opacityNode = opacity;
  sky.userData.opacityUniform = opacity;
  tagPipeline(sky.material, PIPELINE.sky);
  return sky;
}

/** Deterministic sky dressing inside the 180 m gameplay far plane. */
const SKY_LAYER_RADIUS = 168;

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
    const [x, y, z] = skyDomePoint(index, 6601, SKY_LAYER_RADIUS, 0.05);
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
    direction.normalize().multiplyScalar(SKY_LAYER_RADIUS * 0.99);
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
    curtain.position.set(-30 + index * 34, 96 + index * 12, -132 + index * 14);
    curtain.rotation.x = -0.28;
    curtain.frustumCulled = false;
    group.add(curtain);
  }
  group.visible = false;
  return group;
}

function cloudCurve(edge0: number, edge1: number, value: number): number {
  const t = THREE.MathUtils.clamp((value - edge0) / (edge1 - edge0), 0, 1);
  return t * t * (3 - 2 * t);
}

/**
 * Generates a periodic high-resolution alpha field. The previous ten giant
 * one-segment planes read as rectangular assets floating in the sky, especially
 * at 1440p/4K. A spherical veil has no billboard corners, remains seamless at
 * the azimuth wrap and gives both WebGPU and deterministic cameras soft cloud
 * structure without importing a low-resolution panorama.
 */
function makeCloudVeilTexture(): THREE.DataTexture {
  const width = 1_024;
  const height = 512;
  const data = new Uint8Array(width * height * 4);
  for (let y = 0; y < height; y += 1) {
    const v = y / (height - 1);
    const skyBand = cloudCurve(0.12, 0.27, v) * (1 - cloudCurve(0.82, 0.98, v));
    for (let x = 0; x < width; x += 1) {
      const u = x / width;
      const angle = u * Math.PI * 2;
      let field = 0;
      let weight = 0;
      for (let octave = 0; octave < 5; octave += 1) {
        const frequency = 2 ** octave;
        const amplitude = 1 / 2 ** octave;
        const ridge = Math.sin(angle * frequency * 1.5 + v * (11 + octave * 7) + octave * 1.73);
        const cross = Math.cos(angle * frequency * 0.75 - v * (17 + octave * 5) + octave * 2.31);
        field += (ridge * 0.58 + cross * 0.42) * amplitude;
        weight += amplitude;
      }
      const macro = Math.sin(angle * 3 + Math.sin(v * 9) * 1.8) * 0.5 + 0.5;
      const normalized = field / weight * 0.5 + 0.5;
      const density = cloudCurve(0.52, 0.78, normalized * 0.78 + macro * 0.22) * skyBand;
      const index = (y * width + x) * 4;
      data[index] = 255;
      data[index + 1] = 255;
      data[index + 2] = 255;
      data[index + 3] = Math.round(density * 230);
    }
  }
  const texture = new THREE.DataTexture(data, width, height, THREE.RGBAFormat, THREE.UnsignedByteType);
  texture.name = 'pass66-seamless-cloud-veil-texture';
  texture.colorSpace = THREE.SRGBColorSpace;
  texture.wrapS = THREE.RepeatWrapping;
  texture.wrapT = THREE.ClampToEdgeWrapping;
  texture.magFilter = THREE.LinearFilter;
  texture.minFilter = THREE.LinearFilter;
  texture.generateMipmaps = false;
  texture.needsUpdate = true;
  return texture;
}

function makeCloudVeil(): THREE.Group {
  const group = new THREE.Group();
  group.name = 'Pass 66 seamless cloud veil';
  const texture = makeCloudVeilTexture();
  const geometry = new THREE.SphereGeometry(SKY_LAYER_RADIUS * 0.985, 64, 32);
  const primary = new THREE.MeshBasicMaterial({
    name: 'pass66-cloud-veil-primary', color: 0xffffff, map: texture, transparent: true, opacity: 0.5,
    depthWrite: false, fog: false, side: THREE.BackSide,
  });
  const secondary = new THREE.MeshBasicMaterial({
    name: 'pass66-cloud-veil-secondary', color: 0xe8f2f8, map: texture, transparent: true, opacity: 0.24,
    depthWrite: false, fog: false, side: THREE.BackSide,
  });
  group.userData.primaryMaterial = primary;
  group.userData.secondaryMaterial = secondary;
  group.userData.cloudTexture = texture;
  const primaryLayer = new THREE.Mesh(geometry, primary);
  primaryLayer.name = 'pass66-cloud-veil-primary-layer';
  primaryLayer.frustumCulled = false;
  const secondaryLayer = new THREE.Mesh(geometry.clone().scale(0.992, 0.992, 0.992), secondary);
  secondaryLayer.name = 'pass66-cloud-veil-secondary-layer';
  secondaryLayer.rotation.y = Math.PI * 0.37;
  secondaryLayer.frustumCulled = false;
  group.add(primaryLayer, secondaryLayer);
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
  // Lane L: tint pair is uniform-driven so each arena's art direction can
  // colour its own haze (rust-orange RustRig, cyan farcrysis) without a
  // material rebuild. Values are written by applyArenaSystemLayout.
  const mistTintNear = uniform(new THREE.Color(0x7fa5ae));
  const mistTintFar = uniform(new THREE.Color(0xd0d9cf));
  material.colorNode = mix(mistTintNear, mistTintFar, drift);
  material.opacityNode = mistStrength.mul(drift.mul(0.35).add(0.65));
  tagPipeline(material, PIPELINE.mist);
  root.userData.opacityUniform = mistStrength;
  root.userData.tintNearUniform = mistTintNear;
  root.userData.tintFarUniform = mistTintFar;
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
  const smokeTintNear = uniform(new THREE.Color(0x2f3b3e));
  const smokeTintFar = uniform(new THREE.Color(0x7d8984));
  material.colorNode = mix(smokeTintNear, smokeTintFar, billow);
  material.opacityNode = smokeStrength.mul(billow.mul(0.58).add(0.42));
  tagPipeline(material, PIPELINE.smoke);
  root.userData.opacityUniform = smokeStrength;
  root.userData.tintNearUniform = smokeTintNear;
  root.userData.tintFarUniform = smokeTintFar;
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
  const dustTintNear = uniform(new THREE.Color(0xd7b47b));
  const dustTintFar = uniform(new THREE.Color(0xffebc7));
  material.colorNode = mix(dustTintNear, dustTintFar, flicker);
  material.opacityNode = dustStrength.mul(flicker.mul(0.45).add(0.55));
  tagPipeline(material, PIPELINE.dust);
  const dust = new THREE.Points(geometry, material);
  dust.name = 'Pass 64 TSL deterministic dust';
  dust.userData.opacityUniform = dustStrength;
  dust.userData.tintNearUniform = dustTintNear;
  dust.userData.tintFarUniform = dustTintFar;
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
  // Lane L: the arena's atmosphere mood. Density multiplies the authored
  // strengths INSIDE the existing opacity ceilings, so combat visibility
  // bounds are unchanged; tints are pure hue.
  const direction = artDirectionForArena(definition.id);
  const applyTintPair = (node: THREE.Object3D | undefined, near: number, far: number): void => {
    const nearUniform = node?.userData.tintNearUniform as { value: THREE.Color } | undefined;
    const farUniform = node?.userData.tintFarUniform as { value: THREE.Color } | undefined;
    nearUniform?.value.setHex(near);
    farUniform?.value.setHex(far);
  };
  const mist = root.getObjectByName('Pass 64 TSL mist');
  const mistUniform = mist?.userData.opacityUniform as { value: number } | undefined;
  if (mistUniform) {
    mistUniform.value = Math.min(0.12, (0.035 + definition.atmosphere.mist * 0.09) * direction.atmosphere.density)
      * volumetricScale;
  }
  applyTintPair(mist, direction.atmosphere.mistNear, direction.atmosphere.mistFar);
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
  if (smokeUniform) {
    smokeUniform.value = (0.035 + definition.atmosphere.mist * 0.12) * direction.atmosphere.density * volumetricScale;
  }
  applyTintPair(smoke, direction.atmosphere.smokeNear, direction.atmosphere.smokeFar);
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
  if (dustUniform) {
    dustUniform.value = Math.min(0.32, (0.08 + definition.atmosphere.dust * 0.72) * direction.atmosphere.density)
      * volumetricScale;
  }
  applyTintPair(dust, direction.atmosphere.dustNear, direction.atmosphere.dustFar);
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
  // HF-358: registry-driven water swap. The water node present at build time
  // corresponds to the initially-applied arena; when applyDefinition moves to
  // an arena whose authored body differs (present vs absent), rebuild the
  // node in place so each arena gets exactly its registry-owned presentation.
  const existingWater = root.getObjectByName('Pass 64 TSL perimeter water') as THREE.Mesh | undefined;
  const existingBody = (existingWater?.userData.waterBody as { arenaId: string } | undefined)?.arenaId;
  const desiredBody = sharedWaterBodyForArena(definition.id);
  const existingBodyId = existingBody ?? null;
  const desiredBodyId = desiredBody?.arenaId ?? null;
  if (existingWater && existingBodyId !== desiredBodyId) {
    const parent = existingWater.parent;
    const index = parent ? parent.children.indexOf(existingWater) : -1;
    // HF-358: hide before detaching. A retired water body is no longer presented,
    // so anything still holding a reference to it must not read back visible - the
    // swap replaces the object, and a stale handle claiming visibility is how a
    // retired arena's water appears to leak into an arena that has none.
    existingWater.visible = false;
    existingWater.removeFromParent();
    // HF-358: dispose the whole retired SUBTREE, not just the root mesh. The
    // horizon skirt (src/water/ocean-tsl.ts) is a CHILD of the water mesh with
    // its own RingGeometry and MeshBasicMaterial; once detached it is invisible
    // to any later scene-graph traversal, so skipping descendants leaks one
    // ring geometry and one material per arena switch, without bound.
    // Pass 75 reached the same subtree traversal gated on `instanceof THREE.Mesh`;
    // the duck-typed read below is a superset of that gate - every Mesh (High Seas
    // shared-ocean surface and its horizon ring included) still disposes, plus any
    // non-Mesh renderable a future body parents here, while plain Object3D nodes
    // carry no geometry/material and fall through as no-ops.
    existingWater.traverse((descendant) => {
      const meshLike = descendant as {
        geometry?: THREE.BufferGeometry;
        material?: THREE.Material | THREE.Material[];
      };
      meshLike.geometry?.dispose();
      const descendantMaterials = Array.isArray(meshLike.material)
        ? meshLike.material
        : [meshLike.material];
      for (const material of descendantMaterials) {
        if (material) material.dispose();
      }
    });
    const next = makeWater(definition.id, graphics.oceanWaveAmplitude);
    if (parent && index >= 0) {
      parent.children.splice(Math.min(index, parent.children.length), 0, next);
      next.parent = parent;
    } else {
      root.add(next);
    }
  }
  const water = root.getObjectByName('Pass 64 TSL perimeter water');
  if (water) {
    // Only shared-ocean bodies are presented here; retained arena builders keep
    // their own surfaces. A graphics override is a reference amplitude, so the
    // arena's host-authoritative scale always applies.
    const body = sharedWaterBodyForArena(definition.id);
    water.visible = body !== null && (water.userData.waveBands ?? 0) > 0;
    // HF-358 audit correction: the graphics setting is a PROFILE gain, not an
    // arena's authored sea state. Reading it with `?? default` made every
    // authored amplitudeScale dead code, because the runtime always supplies a
    // value - so a calm shore inherited the RustRig storm. Scale the profile gain
    // by the body's authored factor instead of letting it replace it; with no
    // override the body's own authored amplitude stands.
    // Pass 75 keeps that gain x authored-scale rule byte-for-byte for every
    // authored body (High Seas included) and additionally pins the bodyless case
    // to 0, so a hidden placeholder can no longer report the retired arena's
    // amplitude next to the null waterLevel/presentationOwner reset below.
    const amplitude = body
      ? (graphics.oceanWaveAmplitude === undefined
          ? oceanAmplitudeForBody(body)
          : graphics.oceanWaveAmplitude * body.amplitudeScale)
      : 0;
    const amplitudeUniform = water.userData.waveAmplitudeUniform as { value: number } | undefined;
    if (amplitudeUniform) amplitudeUniform.value = amplitude;
    water.userData.waveAmplitude = amplitude;
    if (body) {
      water.userData.waterLevel = body.level;
      water.userData.nearSize = body.nearSize;
      water.userData.presentationOwner = body.presentationOwner;
      water.userData.dryFootprintMask = body.dryFootprintMask;
    } else {
      // Hidden presentation state remains observable through diagnostics, so
      // reset it atomically instead of leaking the previous arena's ocean.
      water.userData.waterLevel = null;
      water.userData.nearSize = 0;
      water.userData.presentationOwner = null;
      water.userData.dryFootprintMask = 'none';
    }
  }
  const sky = root.getObjectByName('Pass 64 TSL atmosphere sky') as SkyMesh | undefined;
  const preset = definition.atmosphere.preset;
  let atmosphereSkyOpacity = 0;
  if (sky) {
    // Every arena owns exactly one scene.background, with a local authored
    // panorama on outdoor maps and an immediate procedural fallback. The old
    // atmosphere dome and point layers duplicated that owner, washing out day
    // skies and drawing hard square stars over RustRig at 4K. Keep the nodes in
    // the audited pipeline inventory but remove them from live presentation.
    sky.visible = false;
    const opacity = sky.userData.opacityUniform as { value: number };
    opacity.value = atmosphereSkyOpacity;
    sky.turbidity.value = definition.atmosphere.clouds ? 4.2 : 1.2;
    sky.rayleigh.value = definition.atmosphere.clouds ? 1.75 : 0.85;
    // Owner-directed per-arena skies: RustRig is true night, Atomic Acres is a
    // deep sunset carrying orange/purple cloud paint, Terminal is plain day.
    if (preset === 'industrial-night') sky.sunPosition.value.set(0.3, -0.16, -0.35).normalize();
    else if (preset === 'sunset-farmland') sky.sunPosition.value.set(0.62, 0.11, -0.3).normalize();
    // Golden hour: sun low but still above the horizon, so the jungle keeps
    // long shadows without tipping into the farmland sunset's dusk.
    // Daylight, not dusk: the sun sits high so the island reads saturated
    // instead of washing beige (see the sky-backdrop preset for the regrade).
    else if (preset === 'jungle-golden-hour') sky.sunPosition.value.set(0.46, 0.78, -0.24).normalize();
    // Open water at midday: sun high and slightly behind the bow.
    else if (preset === 'open-ocean-day') sky.sunPosition.value.set(0.34, 0.86, -0.18).normalize();
    else sky.sunPosition.value.set(0.45, 0.72, -0.22).normalize();
  }
  const stars = root.getObjectByName('Pass 66 night stars');
  if (stars) stars.visible = false;
  const galaxy = root.getObjectByName('Pass 66 galaxy band');
  if (galaxy) galaxy.visible = false;
  const aurora = root.getObjectByName('Pass 66 aurora curtains');
  if (aurora) aurora.visible = false;
  const clouds = root.getObjectByName('Pass 66 seamless cloud veil') as THREE.Group | undefined;
  let cloudVeilOpacity = 0;
  if (clouds) {
    clouds.visible = false;
    const primary = clouds.userData.primaryMaterial as THREE.MeshBasicMaterial;
    const secondary = clouds.userData.secondaryMaterial as THREE.MeshBasicMaterial;
    primary.opacity = 0;
    secondary.opacity = 0;
    cloudVeilOpacity = Math.max(primary.opacity, secondary.opacity);
    clouds.children.forEach((cloud) => { cloud.visible = false; });
  }
  root.userData.tslArenaVisualDefinitionId = definition.id;
  root.userData.tslAtmosphere = { ...definition.atmosphere };
  root.userData.tslSkyComposition = {
    sceneBackgroundDominant: true,
    atmosphereSkyVisible: atmosphereSkyOpacity > 0,
    cloudVeilVisible: (clouds?.visible ?? false) && cloudVeilOpacity > 0,
  };
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

function makeWater(
  arenaId: ArenaVisualDefinition['id'],
  amplitude?: number,
): THREE.Mesh {
  // HF-358: the water-authoring registry is the single source for which arenas
  // have water. The WebGPU surface is the ocean-tsl factory over the shared
  // frozen ocean-spectrum — the exact table CPU buoyancy samples.
  const body = sharedWaterBodyForArena(arenaId);
  if (!body) {
    // No authored water here: keep an inert named placeholder so callers that
    // look the mesh up by name keep working; it stays invisible. It still
    // carries the water pipeline tag so the fail-closed traversal audit keeps
    // counting the full authored pipeline set regardless of arena.
    const placeholder = new THREE.Mesh(new THREE.BufferGeometry(), new MeshStandardNodeMaterial());
    placeholder.name = 'Pass 64 TSL perimeter water';
    placeholder.visible = false;
    tagPipeline(placeholder.material, PIPELINE.water);
    placeholder.userData.waveBands = 0;
    return placeholder;
  }
  const amplitudeOverride = amplitude === undefined
    ? oceanAmplitudeForBody(body)
    : amplitude * body.amplitudeScale;
  // Pass 64 contract: the water pipeline id stays tagged on this node material
  // so assertRuntimeTslTraversal keeps failing closed if it disappears.
  const tsl = createOceanTslWater(body, { amplitude: amplitudeOverride, pipelineId: PIPELINE.water });
  tsl.mesh.visible = true;
  return tsl.mesh;
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
  volumetricLight: THREE.DirectionalLight | THREE.PointLight | null = null,
): Readonly<{
  scenePass: ReturnType<typeof pass>;
  screenSpace: ScreenSpacePostGraph;
  setAtmosphere(skyColor: THREE.Color, sunWhite: number): void;
  linearSourceStages: readonly string[];
  applyDefinition(next: ArenaVisualDefinition): void;
  applyGraphics(next: Pass65TslGraphicsOptions): void;
  beforeRender(): void;
  dispose(): void;
}> {
  const screenSpaceRuntime = graphics.screenSpace ?? SCREEN_SPACE_POST_DISABLED;
  const scenePass = pass(scene, camera, { samples: graphics.principalSamples });
  // FSR 1 is a real spatial upscale, so the scene has to actually be rendered
  // below the drawing buffer for it to buy anything; EASU then reconstructs
  // back up in the display chain. This is the whole difference from render
  // scale, which shrinks the drawing buffer itself and hands the upsample to
  // the browser's bilinear blit.
  if (screenSpaceRuntime.upscaling.enabled) {
    scenePass.setResolutionScale(screenSpaceRuntime.upscaling.sceneResolutionScale);
  }
  // One MRT declaration for every consumer. An attachment nobody reads is pure
  // per-fragment bandwidth, so each one is gated on a feature that is actually
  // on: normals for GTAO/SSR/SSGI, a packed metalness+roughness pair for SSR's
  // GGX sampling, and NDC motion vectors for the blur.
  const screenSpaceMrt = screenSpaceMrtRequirement(screenSpaceRuntime);
  const wantsNormal = graphics.ambientOcclusion.enabled || screenSpaceMrt.normal;
  if (wantsNormal || screenSpaceMrt.material || screenSpaceMrt.velocity) {
    scenePass.setMRT(mrt({
      output,
      ...(wantsNormal ? { normal: normalView } : {}),
      ...(screenSpaceMrt.material ? { material: packedMaterialMrtNode(metalness, roughness) } : {}),
      ...(screenSpaceMrt.velocity ? { velocity } : {}),
    }));
  }
  const sceneColor = scenePass.getTextureNode('output');
  const sceneDepth = scenePass.getTextureNode('depth');
  const sceneNormal = wantsNormal ? scenePass.getTextureNode('normal') : null;
  const atmosphereSkyColor = new THREE.Color();
  const screenSpace = buildScreenSpacePostGraph({
    sceneColor,
    sceneDepth,
    sceneViewZ: scenePass.getViewZNode(),
    sceneNormal: screenSpaceMrt.normal ? sceneNormal : null,
    sceneMaterial: screenSpaceMrt.material ? scenePass.getTextureNode('material') : null,
    sceneVelocity: screenSpaceMrt.velocity ? scenePass.getTextureNode('velocity') : null,
    camera,
    volumetricLight,
  }, screenSpaceRuntime);
  const gtaoPass = graphics.ambientOcclusion.enabled && sceneNormal ? ao(sceneDepth, sceneNormal, camera) : null;
  if (gtaoPass) {
    gtaoPass.resolutionScale = graphics.ambientOcclusion.resolutionScale;
    gtaoPass.samples.value = graphics.ambientOcclusion.samples;
    gtaoPass.radius.value = graphics.ambientOcclusion.radius;
    gtaoPass.scale.value = 0.5;
    gtaoPass.thickness.value = 1;
    gtaoPass.distanceExponent.value = 1;
    gtaoPass.distanceFallOff.value = 1;
    // Temporal filtering stays OFF: it rotates the sample pattern per frame
    // and is only stable underneath a TRAA resolve this chain does not run;
    // without one it reads as shimmer and breaks deterministic review frames.
    gtaoPass.useTemporalFiltering = false;
  }
  // High/Ultra AO tiers run the upstream depth/normal-aware spatial denoise
  // over the raw GTAO target (the documented non-TRAA path). Low keeps the
  // raw single-pass output as the cheap tier. This is a graph-topology
  // choice, so it participates in the ambientOcclusion pipeline-rebuild
  // contract exactly like the MRT enable does.
  const gtaoDenoise = gtaoPass && sceneNormal && graphics.ambientOcclusion.denoise
    ? denoise(gtaoPass.getTextureNode(), sceneDepth, sceneNormal, camera)
    : null;
  // The denoise TempNode carries no typed swizzles; its output is the vec4
  // denoised AO, so the red-channel read mirrors the raw GTAO path exactly.
  const occlusionSample = gtaoDenoise
    ? nodeObject(gtaoDenoise as unknown as Node<'vec4'>).r
    : gtaoPass ? gtaoPass.getTextureNode().r : null;
  // Lane L: the arena's authored linear grade composed with its art
  // direction. This is the pre-tone-map half of the place identity; the
  // display half (CDL, split tone, vignette character) is pushed into the
  // installed filmic chain below.
  const initialSceneGrade = composeArtDirectedSceneGrade(
    definition.colorPipeline.grade,
    artDirectionForArena(definition.id),
  );
  const saturation = uniform(initialSceneGrade.saturation);
  const contrast = uniform(initialSceneGrade.contrast);
  const pushArtDirectionToChain = (arenaId: ArenaVisualDefinition['id']): void => {
    installedFilmicGradeChain(renderPipeline)?.setArenaArtDirection(artDirectionForArena(arenaId));
  };
  pushArtDirectionToChain(definition.id);
  // HF-363: linear-side ordered dither removed — display-referred grain now lives
  // in the filmic grade chain (per-frame-luminance-grain stage), fed by
  // legacy-main through setGradeGrainStrength. The orphaned linear grain
  // uniform this assembler kept writing (but no node ever read) was retired in
  // the Lane L streamline pass.
  const contactOcclusionStrength = uniform(graphics.ambientOcclusion.enabled ? graphics.ambientOcclusion.strength : 0);
  // Everything downstream reads the screen-space graph's scene colour, which is
  // the motion-blurred image when that stage is built and the raw scene pass
  // otherwise. Reading `sceneColor` directly here would silently drop the blur.
  const gradedSource = nodeObject(screenSpace.sceneColor);
  const luma = dot(gradedSource.rgb, vec3(0.2126, 0.7152, 0.0722));
  const saturated = mix(vec3(luma), gradedSource.rgb, saturation);
  const contrasted = saturated.sub(0.5).mul(contrast).add(0.5);
  const pixel = vec2(1).div(screenSize);
  const depthRight = sceneDepth.sample(screenUV.add(vec2(pixel.x, 0)));
  const depthUp = sceneDepth.sample(screenUV.add(vec2(0, pixel.y)));
  const depthDiscontinuity = max(abs(sceneDepth.sub(depthRight)), abs(sceneDepth.sub(depthUp)));
  // Suppress the blur at geometry depth discontinuities. This keeps emissive
  // energy on the visible side of roofs, walls and portal frames rather than
  // allowing the low-resolution bloom chain to smear across their silhouettes.
  const depthEdgeGuard = float(1).sub(smoothstep(0.00035, 0.0035, depthDiscontinuity));
  const emissiveBloom = bloom(sceneColor, graphics.post.bloomStrength, 0.32, 0.92);
  const contactOcclusion = occlusionSample
      ? mix(float(1), occlusionSample, contactOcclusionStrength)
      : float(1);
    // HF-364 linear composite order, matching LINEAR_SOURCE_STAGE_ORDER:
    //   [motion blur] -> [+SSGI bounce] -> *contact occlusion
    //   -> +bloom -> [+godray shafts] -> [depth of field]
    // GI is added BEFORE the occlusion multiply so GTAO darkens bounced light
    // exactly as it darkens direct light; reflections and shafts are added
    // after it because a reflection is not occluded by the surface reflecting
    // it, and a shaft is volume in front of the surface, not on it.
    const withBounce = screenSpace.bounceLight ? contrasted.add(screenSpace.bounceLight) : contrasted;
    const occluded = withBounce.mul(contactOcclusion);
    const withReflections = screenSpace.reflectionLight
      ? occluded.add(screenSpace.reflectionLight)
      : occluded;
    // HF-481. The inscattering half of the transmittance equation, added never
    // mixed, so it can wash a far silhouette's CONTRAST but can never delete
    // the silhouette. Its ceiling is swept in `atmosphere/aerial-perspective.ts`
    // and clamped again per channel inside the node.
    const withAtmosphere = screenSpace.atmosphereLight
      ? withReflections.add(screenSpace.atmosphereLight)
      : withReflections;
    // Pass 76: the linear-side vignette stage was retired. The display-side
    // 'display-vignette-falloff' stage in the filmic grade chain is the ONE
    // vignette owner (legacy-main drives setDisplayVignetteStrength); running
    // both stacked two falloffs on exactly the screen periphery enemies enter
    // from, while this one held the setting and the display one idled at zero.
    const hdrWithBloom = withAtmosphere.add(emissiveBloom.rgb.mul(depthEdgeGuard));
    // Shafts reuse the bloom path's depth-discontinuity guard rather than the
    // upstream depthAwareBlend helper: that helper mixes toward a flat colour,
    // which at shaft strength replaces a silhouette with solid light. Adding a
    // guarded, gain-capped shaft can brighten a pixel but can never delete one.
    // HF-401: the shaft term is the ONE part of this expression whose presence
    // is arena-scoped rather than settings-scoped, because upstream
    // `GodraysNode` can only be built against a light that casts shadows and
    // the arena visual definition decides that per map. Everything else here —
    // the scene pass, its MRT, GTAO, the bloom chain — is settings-scoped and
    // is deliberately NOT rebuilt when the shafts come and go.
    const composeLinearHdr = (): Node<'vec4'> => {
      const shaftLight = screenSpace.shaftLight();
      // Shafts reuse the bloom path's depth-discontinuity guard rather than the
      // upstream depthAwareBlend helper: that helper mixes toward a flat colour,
      // which at shaft strength replaces a silhouette with solid light. Adding a
      // guarded, gain-capped shaft can brighten a pixel but can never delete one.
      const hdrWithShafts = shaftLight
        ? hdrWithBloom.add(nodeObject(shaftLight).mul(depthEdgeGuard))
        : hdrWithBloom;
      return screenSpace.applyDepthOfField(
        vec4(hdrWithShafts, gradedSource.a) as unknown as Node<'vec4'>,
      );
    };
    // The grade chain's order contract has to describe the graph that is
    // actually installed, so the stage list is rebuilt from what the
    // screen-space graph BUILT, never from what the settings asked for.
    const currentLinearSourceStages = (): readonly string[] =>
      pass64LinearSourceStages(graphics, screenSpace.stages());
    let linearSourceStages = currentLinearSourceStages();
    const installComposite = (): void => {
      renderPipeline.outputNode = composeLinearHdr();
      renderPipeline.needsUpdate = true;
      linearSourceStages = currentLinearSourceStages();
      installedFilmicGradeChain(renderPipeline)?.setLinearSourceStages(linearSourceStages);
    };
    renderPipeline.outputNode = composeLinearHdr();
    renderPipeline.needsUpdate = true;
    return {
      scenePass,
      screenSpace,
      setAtmosphere(skyColor, sunWhite) {
        screenSpace.setAtmosphere(skyColor, sunWhite);
      },
      get linearSourceStages() { return linearSourceStages; },
      applyDefinition(next) {
        const sceneGrade = composeArtDirectedSceneGrade(
          next.colorPipeline.grade,
          artDirectionForArena(next.id),
        );
        saturation.value = sceneGrade.saturation;
        contrast.value = sceneGrade.contrast;
        pushArtDirectionToChain(next.id);
        // HF-481. The arena's AUTHORED fog colour is the haze colour, which is
        // the honest source: it is already the colour the arena says its air is,
        // it is already tinted per time of day by the lighting lane's
        // `LightingConditionWrites`, and taking it here means the atmosphere and
        // the fog can never disagree about what the air looks like. `sunWhite`
        // is the arena's own key intensity, which is what normalises the Mie
        // term into the band the combat ceiling is stated in.
        atmosphereSkyColor.setHex(next.fog.color);
        screenSpace.setAtmosphere(atmosphereSkyColor, next.lighting.sunIntensity);
        // The committing arena has already installed its sun by the time a
        // definition is applied, so this is where the shaft stage learns
        // whether it has a shadow map to raymarch. Recompose only when the
        // answer changed; a recompose is a pipeline rebuild and this runs
        // inside the paused arena-transition window on purpose.
        if (screenSpace.refreshShaftStage()) installComposite();
      },
      applyGraphics(next) {
        emissiveBloom.strength.value = next.post.bloomStrength;
        contactOcclusionStrength.value = gtaoPass && next.ambientOcclusion.enabled
          ? next.ambientOcclusion.strength
          : 0;
        if (gtaoPass && next.ambientOcclusion.enabled) {
            gtaoPass.resolutionScale = next.ambientOcclusion.resolutionScale;
            gtaoPass.samples.value = next.ambientOcclusion.samples;
            gtaoPass.radius.value = next.ambientOcclusion.radius;
          }
          screenSpace.applyRuntime(next.screenSpace ?? SCREEN_SPACE_POST_DISABLED);
          if (screenSpace.refreshShaftStage()) installComposite();
        },
        beforeRender() {
          screenSpace.beforeRender();
        },
        dispose() {
          screenSpace.dispose();
          gtaoDenoise?.dispose();
          gtaoPass?.dispose();
        },
      };
    }

function disposeRoot(root: THREE.Group): void {
  const geometries = new Set<THREE.BufferGeometry>();
  const materials = new Set<THREE.Material>();
  const textures = new Set<THREE.Texture>();
  root.traverse((node) => {
    const mesh = node as THREE.Mesh;
    if (mesh.geometry) geometries.add(mesh.geometry);
    const nodeMaterials = Array.isArray(mesh.material) ? mesh.material : mesh.material ? [mesh.material] : [];
    for (const material of nodeMaterials) {
      materials.add(material);
      const map = (material as THREE.Material & { map?: THREE.Texture | null }).map;
      if (map) textures.add(map);
    }
  });
  root.removeFromParent();
  for (const geometry of geometries) geometry.dispose();
  for (const material of materials) material.dispose();
  for (const texture of textures) texture.dispose();
  root.clear();
}

/**
 * Reports a screen-space effect as enabled only when it exists in the built
 * graph AND the live settings still ask for it. Publishing the request alone
 * would let telemetry claim a pass that was never allocated.
 */
function screenSpaceTelemetry<T extends { enabled: boolean }>(constructed: T, live: T): Readonly<T> {
  return Object.freeze({ ...live, enabled: constructed.enabled && live.enabled });
}

export function createPass64TslSceneSystems(
  scene: THREE.Scene,
  camera: THREE.Camera,
  renderPipeline: RenderPipeline,
  definition: ArenaVisualDefinition,
  graphics: Pass65TslGraphicsOptions = DEFAULT_TSL_GRAPHICS_OPTIONS,
  renderer?: WebGPURenderer,
  // HF-364: the shadow-casting light the volumetric shafts raymarch. Passed in
  // rather than discovered by traversal because the caller owns the arena's
  // sun and its shadow camera, and the upstream node references both directly.
  volumetricLight: THREE.DirectionalLight | THREE.PointLight | null = null,
): Pass64TslSceneSystems {
  let activeDefinition = definition;
  let activeGraphics = graphics;
  let activeReviewCamera: ArenaReviewCamera | null = null;
  // IBL state for WebGPU arena environment maps
  let activeIblState: ArenaIblState = {
    environmentTexture: null,
    pmremTarget: null,
    arenaId: null,
    resolutionTier: 128,
    budgetEnvironmentIntensity: 0,
    arenaEnvironmentScale: 0,
    reflectionScale: 0,
    sourceTexture: null,
    generatedCubeSize: 0,
  };
  /**
   * The program's ONLY environment-generation site, shared by all three drivers
   * (definition commit, explicit bootstrap, graphics change) so none of them can
   * drift apart again. It is guarded on `scene.background` rather than on
   * `activeIblState.environmentTexture`: the old guard meant a settings change
   * could never bootstrap an environment that did not already exist, which is
   * both how `reflectionQuality: off -> high` failed to come back and why a
   * settings change could not rescue the null first arena.
   */
  const canSyncArenaEnvironmentIbl = (): boolean => Boolean(renderer && scene.background)
    // Generated skies are installed as a procedural texture first and may
    // replace it with the authored equirectangular asset while the arena
    // definition is being committed. Do not convolve that known-intermediate
    // texture: configurePlayableArenaVisuals seals the sky and drives the one
    // required PMREM generation below it. This keeps the cold path from doing
    // the same expensive bake once for the placeholder and again for the
    // admitted asset.
    && scene.userData.pass66SkyBackdropStatus !== 'asset-loading';
  const syncArenaEnvironmentIbl = async (): Promise<void> => {
    if (!renderer) return;
    activeIblState = await applyArenaEnvironmentIbl(
      renderer,
      scene,
      activeDefinition.id,
      activeGraphics.reflectionQuality,
      activeGraphics.environmentIntensity,
      activeGraphics.reflectionScale,
      activeIblState,
    );
  };
  const arenaEnvironmentObservation = (): ArenaEnvironmentObservation => observeArenaEnvironment(
    scene,
    activeDefinition.id,
    activeGraphics.reflectionQuality,
    activeGraphics.environmentIntensity,
    activeGraphics.reflectionScale,
    activeIblState,
  );
  const root = new THREE.Group();
  root.name = 'Pass 64 WebGPU TSL presentation systems';
  root.userData.pass64TslPresentation = true;
  root.add(
    makeSky(),
    makeNightStars(),
    makeGalaxyBand(),
    makeAuroraCurtains(),
    makeCloudVeil(),
    makeMist(definition),
    makeSmoke(definition),
    makeDust(definition),
    makeGrass(definition.id),
    makeWater(definition.id, graphics.oceanWaveAmplitude),
  );
  scene.add(root);
  const hdr = configureHdrPipeline(renderPipeline, scene, camera, definition, graphics, volumetricLight);
  const scenePass = hdr.scenePass;
  const constructedScreenSpace = graphics.screenSpace ?? SCREEN_SPACE_POST_DISABLED;
  // The requested screen-space runtime and the one after adaptive pressure are
  // deliberately separate: a downshift must not be mistaken for the player's
  // choice, so a later settings apply re-derives from the request, not from
  // whatever the pressure valve last wrote.
  let requestedScreenSpace = constructedScreenSpace;
  let adaptedScreenSpace = constructedScreenSpace;
  const liveScreenSpace = (): GraphicsRuntime['screenSpace'] => adaptedScreenSpace;
  applyArenaSystemLayout(root, definition, definition.reviewCameras[0]?.seed ?? 6401, graphics);
  // Cold-compile attribution for the arena coverage fence. The transition
  // profiler can only see `coverage-submit-fence` as one number (measured
  // 3.4 s atomic-acres, 2.3 s high-seas, 9.8 s farcrysis on an RTX 5080 at the
  // MAX preset, against a 12 s cold allowance) and cannot say how much of it
  // is this yielding ScenePass compile versus the forced full-coverage draw
  // that follows. Without that split, the next attempt at the MAX admission
  // budget has to guess which half to attack. Published into the same
  // userData block QA already reads.
  let lastPrecompile: Readonly<{ durationMs: number; runs: number }> = Object.freeze({ durationMs: 0, runs: 0 });
  const publishActualGraphics = (): void => {
    const mist = root.getObjectByName('Pass 64 TSL mist');
    const smoke = root.getObjectByName('Pass 64 TSL smoke');
    const dust = root.getObjectByName('Pass 64 TSL deterministic dust') as THREE.Points | undefined;
    const water = root.getObjectByName('Pass 64 TSL perimeter water');
    root.userData.pass65AdvancedGraphics = {
      principalSamples: graphics.principalSamples,
      volumetricScale: activeGraphics.volumetricScale,
      volumetricActual: {
        scale: root.userData.tslVolumetricScale,
        mistOpacity: Number((mist?.userData.opacityUniform as { value?: number } | undefined)?.value ?? 0),
        mistLayers: mist?.children.filter(({ visible }) => visible).length ?? 0,
        smokeOpacity: Number((smoke?.userData.opacityUniform as { value?: number } | undefined)?.value ?? 0),
        smokeLayers: smoke?.children.filter(({ visible }) => visible).length ?? 0,
        dustOpacity: Number((dust?.userData.opacityUniform as { value?: number } | undefined)?.value ?? 0),
        dustMotes: dust?.geometry.drawRange.count ?? 0,
      },
      oceanWaveAmplitude: Number(water?.userData.waveAmplitude ?? 0),
      bloomStrength: activeGraphics.post.bloomStrength,
      filmGrainScale: activeGraphics.post.filmGrainScale,
      vignetteStrength: activeGraphics.post.vignetteStrength,
      ambientOcclusion: Object.freeze({
        ...activeGraphics.ambientOcclusion,
        enabled: graphics.ambientOcclusion.enabled && activeGraphics.ambientOcclusion.enabled,
        // The denoise wrap is baked at pipeline construction; report the
        // actual topology, not merely the requested tier.
        denoise: graphics.ambientOcclusion.denoise && activeGraphics.ambientOcclusion.denoise,
      }),
      // Same rule as AO: a screen-space pass that was not built at construction
      // cannot be turned on live, so telemetry reports the intersection of the
      // constructed topology and the live request rather than the request.
      screenSpace: Object.freeze({
        // HF-418: the baked layer's telemetry is the intersection of the
        // constructed topology and the live request, like every row here. Its
        // deeper live state - which volume is bound and what the composite
        // actually received - is the dataset receipt
        // `documentElement.dataset.bakedIndirect`, because that one is written
        // per frame by the code that binds and a per-frame republish of this
        // block would allocate inside the render loop.
        bakedIndirect: screenSpaceTelemetry(
          constructedScreenSpace.bakedIndirect,
          liveScreenSpace().bakedIndirect,
        ),
        // HF-398: the trace's row was missing here for the same reason its
        // stage was missing from the receipt above - a hand-written list that
        // was never extended. It is a projection of the resolved tuning, and
        // its own runtime receipt stays `dataset.rayTracedProxy`.
        rayTracing: screenSpaceTelemetry(
          constructedScreenSpace.rayTracing,
          liveScreenSpace().rayTracing,
        ),
        // HF-401: the shaft stage answers from the BUILT graph, not from the
        // constructed request. It is the one stage whose presence is decided
        // per arena, so `enabled: true` here used to be published on gun-range
        // while three had silently replaced the shaft material with a default
        // one. The reason string travels with it so the refusal is nameable.
        godrays: Object.freeze({
          ...screenSpaceTelemetry(constructedScreenSpace.godrays, liveScreenSpace().godrays),
          enabled: hdr.screenSpace.shaftStage().built,
          unavailableReason: hdr.screenSpace.shaftStage().unavailableReason,
          // What the composite actually received on the last presented frame,
          // so a gate can tell "shafts are on" from "shafts are on and
          // reaching the picture". A getter rather than a snapshot: this block
          // is republished on definition/graphics changes, not per frame, and
          // a per-frame republish would allocate inside the render loop.
          get effectiveAdditiveGain() { return hdr.screenSpace.shaftStage().effectiveAdditiveGain; },
        }),
        reflections: screenSpaceTelemetry(constructedScreenSpace.reflections, liveScreenSpace().reflections),
        globalIllumination: screenSpaceTelemetry(
          constructedScreenSpace.globalIllumination,
          liveScreenSpace().globalIllumination,
        ),
        depthOfField: screenSpaceTelemetry(constructedScreenSpace.depthOfField, liveScreenSpace().depthOfField),
        motionBlur: screenSpaceTelemetry(constructedScreenSpace.motionBlur, liveScreenSpace().motionBlur),
        upscaling: Object.freeze({ ...constructedScreenSpace.upscaling }),
      }),
      linearSourceStages: hdr.linearSourceStages,
      exactScenePassPrecompile: lastPrecompile,
      // Observed, not requested: read straight off `scene.environment` and
      // `scene.environmentIntensity`. The environmentIntensity control used to
      // publish nothing a probe could read, so its only "evidence" was a grep
      // for a symbol in a source file - and that grep passed for months against
      // a call site the first arena of every session never reached.
      arenaEnvironment: arenaEnvironmentObservation(),
    };
  };
  publishActualGraphics();
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
    screenSpace: constructedScreenSpace,
    setAtmosphere: (skyColor, sunWhite) => hdr.setAtmosphere(skyColor, sunWhite),
    // A getter, not a snapshot: the shaft stage can be added or removed by an
    // arena commit, and a frozen list would keep asserting a stage order the
    // installed pipeline no longer has.
    get linearSourceStages() { return hdr.linearSourceStages; },
    setAdaptiveScreenSpaceBudget: (pixelRatioCap, requestedPixelRatioCap) => {
      adaptedScreenSpace = adaptScreenSpacePostForPressure(requestedScreenSpace, {
        pixelRatioCap,
        requestedPixelRatioCap,
      });
      hdr.applyGraphics({ ...activeGraphics, screenSpace: adaptedScreenSpace });
      publishActualGraphics();
    },
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
      const startedAt = performance.now();
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
        lastPrecompile = Object.freeze({
          durationMs: Number((performance.now() - startedAt).toFixed(1)),
          runs: lastPrecompile.runs + 1,
        });
        publishActualGraphics();
      }
    },
    applyDefinition: async (nextDefinition) => {
      activeDefinition = nextDefinition;
      activeReviewCamera = null;
      delete root.userData.tslReviewCameraId;
      applyArenaSystemLayout(root, nextDefinition, nextDefinition.reviewCameras[0]?.seed ?? 6401, activeGraphics);
      hdr.applyDefinition(nextDefinition);
      // Arena environment IBL (PMREM from the sky backdrop) on the WebGPU path.
      // The caller drives `applyArenaEnvironment()` again once the generated sky
      // has been admitted; that call regenerates only if the backdrop texture
      // actually changed underneath this one.
      //
      // The guard is checked HERE and not merely inside the helper: `await` on
      // an already-resolved promise still defers the publish below by a
      // microtask, and on the backends with no WebGPU renderer there is no
      // environment work to wait for. Publishing the receipt in the same tick
      // is the contract those callers are written against.
      if (canSyncArenaEnvironmentIbl()) await syncArenaEnvironmentIbl();
      publishActualGraphics();
    },
    applyArenaEnvironment: async () => {
      await syncArenaEnvironmentIbl();
      publishActualGraphics();
    },
    observeArenaEnvironment: arenaEnvironmentObservation,
    applyGraphics: async (nextGraphics) => {
      activeGraphics = nextGraphics;
      requestedScreenSpace = nextGraphics.screenSpace ?? SCREEN_SPACE_POST_DISABLED;
      adaptedScreenSpace = requestedScreenSpace;
      applyArenaSystemLayout(root, activeDefinition, activeDefinition.reviewCameras[0]?.seed ?? 6401, activeGraphics);
      hdr.applyGraphics(activeGraphics);
      // Reflection settings changed: same arena, so this is an intensity update
      // unless the quality tier moved the PMREM resolution (or the player turned
      // reflections back on after turning them off, which the old
      // environmentTexture guard made unrecoverable).
      if (canSyncArenaEnvironmentIbl()) await syncArenaEnvironmentIbl();
      publishActualGraphics();
    },
    setReviewCamera: (reviewCamera) => {
      activeReviewCamera = reviewCamera;
      applyArenaSystemLayout(root, activeDefinition, reviewCamera.seed, activeGraphics);
      setAnimationTime(root, reviewCamera.fixedTimeMs);
      root.userData.tslReviewCameraId = reviewCamera.id;
    },
    clearReviewCamera: () => {
      activeReviewCamera = null;
      delete root.userData.tslReviewCameraId;
    },
    update: (timeMs) => {
      setAnimationTime(root, activeReviewCamera?.fixedTimeMs ?? timeMs);
      // The shaft tint tracks the live sun colour, so it has to be refreshed on
      // the same cadence as the rest of the presentation rather than only when
      // a setting changes.
      hdr.beforeRender();
    },
    dispose: () => {
      // Dispose IBL environment map resources
      if (renderer && activeIblState.environmentTexture) {
        if (scene.environment === activeIblState.environmentTexture) {
          scene.environment = null;
        }
        activeIblState.environmentTexture.dispose();
        activeIblState.pmremTarget?.dispose();
      }
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
