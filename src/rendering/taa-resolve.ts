/**
 * HF-472 / PASS 96 — the Atomic Acres temporal resolve.
 *
 * This is an in-repo reimplementation of the r185 temporal reprojection
 * pattern. It deliberately does not import or vendor Three's TRAANode: the
 * game owns the policy (velocity/depth rejection, YCoCg neighbourhood clamp,
 * and the sharpen-free blend) while Three owns only the supported NodeMaterial
 * and render-target primitives.
 */

import * as THREE from 'three';
import {
  DepthTexture,
  FloatType,
  HalfFloatType,
  Matrix4,
  NodeMaterial,
  NodeUpdateType,
  QuadMesh,
  RGBAFormat,
  RenderTarget,
  RendererUtils,
  TempNode,
  Vector2,
} from 'three/webgpu';
import type { Node, NodeBuilder, NodeFrame, TextureNode, WebGPURenderer } from 'three/webgpu';
import {
  Fn,
  If,
  convertToTexture,
  float,
  getViewPosition,
  ivec2,
  max,
  min,
  mix,
  passTexture,
  texture,
  uniform,
  uv,
  vec2,
  vec3,
  vec4,
  velocity,
  viewZToOrthographicDepth,
  viewZToPerspectiveDepth,
} from 'three/tsl';

export const TAA_RESOLVE_STAGE = 'taa-temporal-resolve';
export const TAA_RESOLVE_PIPELINE_ID = 'pass96.taa-temporal-resolve.tsl.v1';
export const TAA_DEFAULT_STRENGTH = 0.9;
export const TAA_DEPTH_REJECTION_THRESHOLD = 0.0015;
export const TAA_EDGE_DEPTH_THRESHOLD = 0.001;
export const TAA_MAX_VELOCITY_PIXELS = 96;

const HALTON_OFFSETS = Array.from({ length: 16 }, (_, index) => [
  halton(index + 1, 2),
  halton(index + 1, 3),
] as const);
const QUAD = new QuadMesh();
const SIZE = new Vector2();

type RendererState = Parameters<typeof RendererUtils.resetRendererState>[1];
type TaaCamera = THREE.Camera & {
  near: number;
  far: number;
  updateProjectionMatrix(): void;
  setViewOffset(fullWidth: number, fullHeight: number, offsetX: number, offsetY: number, width: number, height: number): void;
  clearViewOffset(): void;
  isOrthographicCamera?: boolean;
};

export type TaaResolveTuning = Readonly<{
  enabled: boolean;
  /** History contribution. It is a uniform so the live pressure valve can tune it. */
  strength: number;
}>;

export type TaaResolveSources = Readonly<{
  beauty: TextureNode<'vec4'>;
  depth: TextureNode;
  velocity: TextureNode;
  camera: TaaCamera;
}>;

/** The renderer surface needed by the admission-only resolve precompile. */
export type TaaPrecompileRenderer = Pick<WebGPURenderer,
  'getDrawingBufferSize' | 'initRenderTarget' | 'getRenderTarget' | 'getMRT'
  | 'setMRT' | 'setRenderTarget' | 'compileAsync'>;

export type TaaResolveGraph = Readonly<{
  stage: typeof TAA_RESOLVE_STAGE;
  node: TaaResolveNode;
  strength: { value: number };
  historyTarget: RenderTarget;
  resolveTarget: RenderTarget;
  precompile(renderer: TaaPrecompileRenderer, targetScene: THREE.Scene): Promise<void>;
  setJitterFrozen(frozen: boolean): void;
  dispose(): void;
}>;

/** RGB to the YCoCg basis used for the history neighbourhood clamp. */
export function rgbToYCoCg(rgb: readonly [number, number, number]): [number, number, number] {
  const [r, g, b] = rgb;
  return [0.25 * r + 0.5 * g + 0.25 * b, 0.5 * r - 0.5 * b, -0.25 * r + 0.5 * g - 0.25 * b];
}

/** Inverse of {@link rgbToYCoCg}. */
export function yCoCgToRgb(ycocg: readonly [number, number, number]): [number, number, number] {
  const [y, co, cg] = ycocg;
  return [y + co - cg, y + cg, y - co - cg];
}

/** Clamps history in YCoCg, retaining current alpha. */
export function clampHistoryYCoCg(
  history: readonly [number, number, number],
  neighbourhoodMin: readonly [number, number, number],
  neighbourhoodMax: readonly [number, number, number],
): [number, number, number] {
  const historyYCoCg = rgbToYCoCg(history);
  const clamped: [number, number, number] = [
    Math.min(neighbourhoodMax[0], Math.max(neighbourhoodMin[0], historyYCoCg[0])),
    Math.min(neighbourhoodMax[1], Math.max(neighbourhoodMin[1], historyYCoCg[1])),
    Math.min(neighbourhoodMax[2], Math.max(neighbourhoodMin[2], historyYCoCg[2])),
  ];
  return yCoCgToRgb(clamped);
}

/**
 * Three's velocity node is NDC motion. Reprojection moves it into texture UV
 * space and subtracts it from the current sample location.
 */
export function reprojectHistoryUv(
  currentUv: readonly [number, number],
  ndcVelocity: readonly [number, number],
): [number, number] {
  return [currentUv[0] - ndcVelocity[0] * 0.5, currentUv[1] + ndcVelocity[1] * 0.5];
}

export type TaaCpuSample = Readonly<{
  current: readonly [number, number, number];
  history: readonly [number, number, number];
  neighbourhoodMin: readonly [number, number, number];
  neighbourhoodMax: readonly [number, number, number];
  validHistory: boolean;
  strength: number;
}>;

/** Reference resolve used by the unit gate; the GPU graph follows this order. */
export function resolveTaaSample(sample: TaaCpuSample): [number, number, number] {
  if (!sample.validHistory) return [...sample.current];
  const clamped = clampHistoryYCoCg(sample.history, sample.neighbourhoodMin, sample.neighbourhoodMax);
  const weight = Math.min(1, Math.max(0, sample.strength));
  return [
    sample.current[0] * (1 - weight) + clamped[0] * weight,
    sample.current[1] * (1 - weight) + clamped[1] * weight,
    sample.current[2] * (1 - weight) + clamped[2] * weight,
  ];
}

/**
 * The one admission-time NodeMaterial used for the TAA resolve. Two RGBA16F
 * targets are retained: one history target and one resolve target. They are
 * ping-ponged so the resolve writes directly into the next history target;
 * the old resolve-to-history copy was a full RGBA16F transfer every frame.
 */
export class TaaResolveNode extends TempNode<'vec4'> {
  readonly isTaaResolveNode = true;
  readonly updateBeforeType = NodeUpdateType.FRAME;
  readonly beautyNode: TextureNode<'vec4'>;
  readonly depthNode: TextureNode;
  readonly velocityNode: TextureNode;
  readonly camera: TaaCamera;
  readonly historyTarget: RenderTarget;
  readonly resolveTarget: RenderTarget;
  readonly resolveMaterial: NodeMaterial;
  readonly strength: Node<'float'> & { value: number };

  private readonly cameraNearFar = uniform(new Vector2());
  private readonly cameraWorld = uniform(new Matrix4());
  private readonly cameraWorldInverse = uniform(new Matrix4());
  private readonly cameraProjectionInverse = uniform(new Matrix4());
  private readonly previousCameraWorld = uniform(new Matrix4());
  private readonly previousCameraProjectionInverse = uniform(new Matrix4());
  private readonly previousDepthNode = texture(new DepthTexture(1, 1));
  private readonly originalProjection = new Matrix4();
  private readonly outputTexture: ReturnType<typeof passTexture>;
  private readonly historyTextureNode: TextureNode;
  private historyReadTarget: RenderTarget;
  private historyWriteTarget: RenderTarget;
  private historyNeedsSeed = true;
  private velocityForJitter: Node<'vec4'> | null = null;
  private needsPipelineSync = false;
  private jitterIndex = 0;
  private jitterFrozen = false;

  constructor(sources: TaaResolveSources, tuning: TaaResolveTuning) {
    super('vec4');
    this.name = 'TAA ours';
    this.beautyNode = convertToTexture(sources.beauty) as TextureNode<'vec4'>;
    this.depthNode = sources.depth;
    this.velocityNode = sources.velocity;
    this.camera = sources.camera;
    this.strength = uniform(Math.min(1, Math.max(0, tuning.strength))) as unknown as Node<'float'> & { value: number };
    this.historyTarget = new RenderTarget(1, 1, {
      depthBuffer: false,
      format: RGBAFormat,
      type: HalfFloatType,
      depthTexture: new DepthTexture(),
    });
    this.historyTarget.texture.name = 'TAA ours.history.RGBA16F';
    this.resolveTarget = new RenderTarget(1, 1, {
      depthBuffer: false,
      format: RGBAFormat,
      type: HalfFloatType,
    });
    this.resolveTarget.texture.name = 'TAA ours.resolve.RGBA16F';
    this.resolveMaterial = new NodeMaterial();
    this.resolveMaterial.name = 'TAA ours.resolve NodeMaterial';
    this.historyReadTarget = this.historyTarget;
    this.historyWriteTarget = this.resolveTarget;
    this.historyTextureNode = texture(this.historyReadTarget.texture);
    this.outputTexture = passTexture(this as unknown as Parameters<typeof passTexture>[0], this.historyWriteTarget.texture);
  }

  getTextureNode() {
    return this.outputTexture;
  }

  setJitterFrozen(frozen: boolean): void {
    this.jitterFrozen = frozen;
  }

  setSize(width: number, height: number): void {
    this.historyTarget.setSize(width, height);
    this.resolveTarget.setSize(width, height);
  }

  setViewOffset(width: number, height: number): void {
    this.camera.updateProjectionMatrix();
    this.originalProjection.copy(this.camera.projectionMatrix);
    this.setVelocityProjection(this.originalProjection);
    const jitter = HALTON_OFFSETS[this.jitterIndex];
    this.camera.setViewOffset(width, height, jitter[0] - 0.5, jitter[1] - 0.5, width, height);
  }

  clearViewOffset(): void {
    this.camera.clearViewOffset();
    this.setVelocityProjection(null);
    if (!this.jitterFrozen) this.jitterIndex = (this.jitterIndex + 1) % HALTON_OFFSETS.length;
  }

  updateBefore(frame: NodeFrame): boolean {
    const renderer = frame.renderer;
    if (!renderer) return false;
    this.previousCameraWorld.value.copy(this.cameraWorld.value);
    this.previousCameraProjectionInverse.value.copy(this.cameraProjectionInverse.value);
    this.cameraNearFar.value.set(this.camera.near, this.camera.far);
    this.cameraWorld.value.copy(this.camera.matrixWorld);
    this.cameraWorldInverse.value.copy(this.camera.matrixWorldInverse);
    this.cameraProjectionInverse.value.copy(this.camera.projectionMatrixInverse);
    const beautyRenderTarget = (this.beautyNode as unknown as { passNode: { renderTarget: RenderTarget } }).passNode.renderTarget;
    const width = beautyRenderTarget.texture.width;
    const height = beautyRenderTarget.texture.height;
    if (this.needsPipelineSync) {
      this.setViewOffset(width, height);
      this.needsPipelineSync = false;
    }
    const rendererState = RendererUtils.resetRendererState(renderer, {} as RendererState);
    const needsRestart = this.historyTarget.width !== width || this.historyTarget.height !== height;
    this.setSize(width, height);
    if (needsRestart || this.historyNeedsSeed) {
      renderer.initRenderTarget(this.historyTarget);
      renderer.initRenderTarget(this.resolveTarget);
      renderer.copyTextureToTexture(beautyRenderTarget.texture, this.historyReadTarget.texture);
      this.historyNeedsSeed = false;
    }
    this.historyTextureNode.value = this.historyReadTarget.texture;
    this.outputTexture.value = this.historyWriteTarget.texture;
    const previousRenderTarget = renderer.getRenderTarget();
    const previousMrt = renderer.getMRT();
    renderer.setMRT(null);
    renderer.setRenderTarget(this.historyWriteTarget);
    QUAD.material = this.resolveMaterial;
    QUAD.name = 'TAA ours resolve';
    QUAD.render(renderer);
    renderer.setRenderTarget(previousRenderTarget);
    renderer.setMRT(previousMrt);
    renderer.getDrawingBufferSize(SIZE);
    if (this.historyTarget.width === SIZE.width && this.historyTarget.height === SIZE.height && this.historyTarget.depthTexture) {
      renderer.copyTextureToTexture(this.depthNode.value, this.historyTarget.depthTexture);
      this.previousDepthNode.value = this.historyTarget.depthTexture;
    }
    const completedTarget = this.historyWriteTarget;
    this.historyWriteTarget = this.historyReadTarget;
    this.historyReadTarget = completedTarget;
    RendererUtils.restoreRendererState(renderer, rendererState);
    return true;
  }

  async precompile(renderer: TaaPrecompileRenderer, targetScene: THREE.Scene): Promise<void> {
    const size = renderer.getDrawingBufferSize(SIZE);
    this.setSize(size.width, size.height);
    renderer.initRenderTarget(this.historyTarget);
    renderer.initRenderTarget(this.resolveTarget);
    // The first live update still has to seed whichever target is read. The
    // precompile only warms shader/pipeline state; it must not pretend that a
    // 1x1 or unrendered beauty texture is valid history.
    this.historyNeedsSeed = true;
    const previousRenderTarget = renderer.getRenderTarget();
    const previousMrt = renderer.getMRT();
    renderer.setMRT(null);
    renderer.setRenderTarget(this.historyWriteTarget);
    QUAD.material = this.resolveMaterial;
    try {
      // The resolve quad is intentionally unattached to the gameplay scene.
      // Compile it explicitly against the same scene cache while admission is
      // paused; otherwise the first live TAA update creates its pipeline.
      await renderer.compileAsync(QUAD, QUAD.camera, targetScene);
    } finally {
      renderer.setRenderTarget(previousRenderTarget);
      renderer.setMRT(previousMrt);
    }
  }

  setup(builder: NodeBuilder) {
    const context = builder.context as { renderPipeline?: { context?: { onBeforeRenderPipeline?: () => void; onAfterRenderPipeline?: () => void } }; velocity?: Node<'vec4'> };
    const renderPipeline = context.renderPipeline;
    if (renderPipeline) {
      this.needsPipelineSync = true;
      const pipelineContext = renderPipeline.context;
      if (pipelineContext) {
        pipelineContext.onBeforeRenderPipeline = () => {
          const size = builder.renderer.getDrawingBufferSize(SIZE);
          this.setViewOffset(size.width, size.height);
        };
        pipelineContext.onAfterRenderPipeline = () => this.clearViewOffset();
      }
    }
    if (builder.renderer.reversedDepthBuffer) this.historyTarget.depthTexture!.type = FloatType;
    this.velocityForJitter = context.velocity ?? velocity as unknown as Node<'vec4'>;

    const perspectiveDepth = (depth: Node<'float'>): Node<'float'> => {
      const viewZ = viewZToPerspectiveDepth(depth, this.cameraNearFar.x, this.cameraNearFar.y);
      return viewZ;
    };
    const sampleCurrentDepth = Fn(([positionTexel]: readonly [Node<'vec2'>]) => {
      const closest = float(2).toVar();
      const closestPosition = vec2(0).toVar();
      const farthest = float(-1).toVar();
      for (let x = -1; x <= 1; x += 1) {
        for (let y = -1; y <= 1; y += 1) {
          const neighbour = positionTexel.add(vec2(x, y));
          let depth = this.depthNode.load(neighbour).r;
          if (builder.renderer.reversedDepthBuffer) depth = depth.oneMinus();
          if (builder.renderer.logarithmicDepthBuffer) depth = perspectiveDepth(depth);
          If(depth.lessThan(closest), () => {
            closest.assign(depth);
            closestPosition.assign(neighbour);
          });
          If(depth.greaterThan(farthest), () => farthest.assign(depth));
        }
      }
      return vec4(closest, closestPosition, farthest);
    });
    const samplePreviousDepth = (historyUv: Node<'vec2'>): Node<'float'> => {
      let depth = this.previousDepthNode.sample(historyUv).r;
      if (builder.renderer.logarithmicDepthBuffer) depth = perspectiveDepth(depth);
      const viewPosition = getViewPosition(historyUv, depth, this.previousCameraProjectionInverse as unknown as Node<'mat4'>);
      const worldPosition = (this.previousCameraWorld as unknown as Node<'mat4'>).mul(vec4(viewPosition, 1)).xyz;
      const currentViewZ = (this.cameraWorldInverse as unknown as Node<'mat4'>).mul(vec4(worldPosition, 1)).z;
      return this.camera.isOrthographicCamera
        ? viewZToOrthographicDepth(currentViewZ, this.cameraNearFar.x, this.cameraNearFar.y)
        : viewZToPerspectiveDepth(currentViewZ, this.cameraNearFar.x, this.cameraNearFar.y);
    };
    const rgbToYCoCgNode = (rgb: Node<'vec3'>): Node<'vec3'> => vec3(
      rgb.r.mul(0.25).add(rgb.g.mul(0.5)).add(rgb.b.mul(0.25)),
      rgb.r.sub(rgb.b).mul(0.5),
      rgb.g.mul(0.5).sub(rgb.r.add(rgb.b).mul(0.25)),
    );
    const yCoCgToRgbNode = (ycocg: Node<'vec3'>): Node<'vec3'> => vec3(
      ycocg.x.add(ycocg.y).sub(ycocg.z),
      ycocg.x.add(ycocg.z),
      ycocg.x.sub(ycocg.y).sub(ycocg.z),
    );
    const neighbourhoodClamp = Fn(([positionTexel, historyColor]: readonly [Node<'ivec2'>, Node<'vec4'>]) => {
      const minimum = vec3(1e9).toVar();
      const maximum = vec3(-1e9).toVar();
      for (let x = -1; x <= 1; x += 1) {
        for (let y = -1; y <= 1; y += 1) {
          const sample = this.beautyNode.offset(ivec2(x, y)).load(positionTexel).rgb;
          const ycocg = rgbToYCoCgNode(sample);
          minimum.assign(min(minimum, ycocg));
          maximum.assign(max(maximum, ycocg));
        }
      }
      return yCoCgToRgbNode(rgbToYCoCgNode(historyColor.rgb).clamp(minimum, maximum));
    });
    const resolve = Fn((_builder: NodeBuilder) => {
      const uvNode = uv();
      const textureSize = this.beautyNode.size(float(0)) as unknown as Node<'vec2'>;
      const positionTexel = uvNode.mul(textureSize);
      const currentDepth = sampleCurrentDepth(positionTexel);
      const closestDepth = currentDepth.x;
      const closestPositionTexel = currentDepth.yz;
      const farthestDepth = currentDepth.w;
      const velocitySample = this.velocityNode.load(closestPositionTexel).xy;
      const historyUv = uvNode.sub(velocitySample.mul(vec2(0.5, -0.5))) as unknown as Node<'vec2'>;
      const previousDepth = samplePreviousDepth(historyUv);
      const validUv = historyUv.greaterThanEqual(0).all().and(historyUv.lessThanEqual(1).all());
      const edge = farthestDepth.sub(closestDepth).greaterThan(TAA_EDGE_DEPTH_THRESHOLD);
      const depthRejected = closestDepth.sub(previousDepth).abs().greaterThan(TAA_DEPTH_REJECTION_THRESHOLD);
      const validHistory = validUv.and(edge.or(depthRejected.not()));
      const currentColor = this.beautyNode.sample(uvNode);
      const historyColor = this.historyTextureNode.sample(historyUv);
      const clampedHistory = neighbourhoodClamp(positionTexel as unknown as Node<'ivec2'>, historyColor);
      const velocityPixels = (historyUv as Node<'vec2'>).sub(uvNode).mul(textureSize).length();
      const motionCurrentWeight = velocityPixels.div(TAA_MAX_VELOCITY_PIXELS).saturate();
      const historyWeight = validHistory.select(this.strength.mul(motionCurrentWeight.oneMinus()), float(0));
      return mix(currentColor, vec4(clampedHistory, historyColor.a), historyWeight);
    });
    this.resolveMaterial.colorNode = resolve();
    return this.outputTexture;
  }

  private setVelocityProjection(matrix: Matrix4 | null): void {
    (this.velocityForJitter as unknown as { setProjectionMatrix?: (value: Matrix4 | null) => void } | null)
      ?.setProjectionMatrix?.(matrix);
  }

  dispose(): void {
    this.historyTarget.dispose();
    this.resolveTarget.dispose();
    this.resolveMaterial.dispose();
  }
}

export function buildTaaResolveNode(sources: TaaResolveSources, tuning: TaaResolveTuning): TaaResolveGraph {
  if (!tuning.enabled) throw new Error('TAA resolve cannot be built while disabled');
  const node = new TaaResolveNode(sources, tuning);
  return Object.freeze({
    stage: TAA_RESOLVE_STAGE,
    node,
    strength: node.strength,
    historyTarget: node.historyTarget,
    resolveTarget: node.resolveTarget,
    precompile: (renderer, targetScene) => node.precompile(renderer, targetScene),
    setJitterFrozen: (frozen: boolean) => node.setJitterFrozen(frozen),
    dispose: () => node.dispose(),
  });
}

function halton(index: number, base: number): number {
  let fraction = 1;
  let result = 0;
  let current = index;
  while (current > 0) {
    fraction /= base;
    result += fraction * (current % base);
    current = Math.floor(current / base);
  }
  return result;
}
