import * as THREE from 'three';
import { MeshBasicNodeMaterial } from 'three/webgpu';
import * as TSL from 'three/tsl';
import type { PresentationPrewarmRuntime } from '../rendering/render-runtime';
import {
  NUKE_EVENT_BACKGROUND_BUDGET_P50_MS,
  NUKE_EVENT_BACKGROUND_DISTANCE_M,
  NUKE_EVENT_CAMERA_FAR_M,
  NUKE_EVENT_RAY_STEPS,
  deriveNukeEventTriggerFromReplicatedState,
  nukeEventSeed,
  writeNukeEventTimeline,
  type NukeEventTimeline,
  type ReplicatedMatchEndState,
} from './timeline';

const {
  Fn, Loop, cameraPosition, clamp, cos, dot, exp, float, length, max, mix, normalize,
  positionLocal, positionWorld, sin, smoothstep, uniform, vec2, vec3, vec4,
} = TSL as unknown as Record<string, any>;

export {
  NUKE_EVENT_BACKGROUND_BUDGET_P50_MS,
  NUKE_EVENT_BACKGROUND_DISTANCE_M,
  NUKE_EVENT_CAMERA_FAR_M,
  NUKE_EVENT_RAY_STEPS,
  NUKE_EVENT_RISE_SECONDS,
  NUKE_EVENT_TOTAL_SECONDS,
  NUKETOWN2_ARENA_ID,
  deriveNukeEventTriggerFromReplicatedState,
  nukeEventSeed,
  sampleNukeEventTimeline,
  type NukeEventPhase,
  type NukeEventTimeline,
  type ReplicatedMatchEndState,
} from './timeline';

/** Exactly two new material/pipeline families: one volume and one ground ring. */
export const NUKE_EVENT_PIPELINE_IDS = Object.freeze([
  'nuke-event-volume-tsl-v1',
  'nuke-event-ring-tsl-v1',
] as const);

const BACKGROUND_CLOUD_ORIGIN: readonly [number, number, number] = [0, 112, NUKE_EVENT_BACKGROUND_DISTANCE_M];
const BACKGROUND_CLOUD_HALF_EXTENTS: readonly [number, number, number] = [78, 124, 78];
const EVENT_VOLUME_ORIGIN: readonly [number, number, number] = [0, 112, NUKE_EVENT_BACKGROUND_DISTANCE_M];
const EVENT_VOLUME_HALF_EXTENTS: readonly [number, number, number] = [82, 132, 82];
const RING_ORIGIN: readonly [number, number, number] = [0, 0.08, NUKE_EVENT_BACKGROUND_DISTANCE_M];

export type NukeEventPresentationOptions = Readonly<{
  backend?: 'webgpu' | 'webgl2';
  sunDirection?: readonly [number, number, number];
  onDetonation?: (triggerAtHostTimeMs: number, seed: number) => void;
}>;

function setVector(target: THREE.Vector3, value: readonly [number, number, number]): void {
  target.set(value[0], value[1], value[2]);
}

function createVolumeMaterial(
  volumeOrigin: any,
  volumeHalfExtents: any,
  volumeMode: any,
  volumeClock: any,
  volumeSeed: any,
  volumeOpacity: any,
  eventFlash: any,
  eventGrowth: any,
  eventFade: any,
  sunDirection: any,
): MeshBasicNodeMaterial {
  const material = new MeshBasicNodeMaterial();
  material.transparent = true;
  material.depthWrite = false;
  material.depthTest = true;
  material.side = THREE.BackSide;
  material.blending = THREE.AdditiveBlending;
  material.fog = false;
  material.toneMapped = false;

  material.colorNode = Fn(() => {
    const ray = positionWorld.sub(cameraPosition).toVar();
    const distance = max(length(ray), float(0.1));
    const direction = normalize(ray).toVar();
    const stepLength = distance.div(float(NUKE_EVENT_RAY_STEPS));
    const sampleAt = stepLength.mul(0.5).toVar();
    const accumulated = float(0).toVar();

    Loop(NUKE_EVENT_RAY_STEPS, () => {
      const samplePosition = cameraPosition.add(direction.mul(sampleAt));
      const p = samplePosition.sub(volumeOrigin).div(volumeHalfExtents);
      const radial = length(vec2(p.x, p.z));
      const stem = float(1).sub(smoothstep(float(0.18), float(0.52), radial))
        .mul(smoothstep(float(-1), float(-0.42), p.y))
        .mul(float(1).sub(smoothstep(float(0.28), float(0.86), p.y)));
      const capRing = float(1).sub(smoothstep(float(0.12), float(0.56), length(vec2(
        radial.sub(float(0.46)), p.y.sub(float(0.36)).mul(float(1.1)),
      ))));
      const capDome = float(1).sub(smoothstep(float(0.48), float(0.98), radial))
        .mul(smoothstep(float(0.06), float(0.34), p.y))
        .mul(float(1).sub(smoothstep(float(0.62), float(0.96), p.y)));
      const backgroundShape = max(stem, max(capRing, capDome));
      const eventExpand = float(0.26).add(eventGrowth.mul(float(0.74)));
      const eventRadial = radial.div(eventExpand);
      const eventFireballY = p.y.sub(float(-0.82).add(eventGrowth.mul(float(0.36))));
      const fireball = exp(eventRadial.mul(eventRadial).add(eventFireballY.mul(eventFireballY)).mul(float(-4.2))).mul(eventFlash);
      const eventStemRadius = radial.div(float(0.12).add(eventGrowth.mul(0.18)));
      const eventStem = float(1).sub(smoothstep(float(0.15), float(0.62), eventStemRadius))
        .mul(smoothstep(float(-0.96), float(-0.3), p.y.sub(eventGrowth.mul(0.42))))
        .mul(float(1).sub(smoothstep(float(0.18), float(0.9), p.y.sub(eventGrowth.mul(0.42)))));
      const eventCap = float(1).sub(smoothstep(float(0.1), float(0.6), length(vec2(
        radial.div(eventExpand).sub(float(0.43)),
        p.y.sub(float(0.18).add(eventGrowth.mul(0.42))).mul(float(1.05)),
      ))));
      const eventShape = max(fireball, max(eventStem, eventCap)).mul(eventFade);
      const shape = mix(backgroundShape, eventShape, volumeMode);
      // Three cheap bands form deterministic value-like fractal noise. It is
      // an in-graph equivalent; all instance values remain uniforms.
      const noise0 = sin(p.x.mul(6.2).add(p.y.mul(9.7)).add(p.z.mul(5.4)).add(volumeClock.mul(0.18)).add(volumeSeed));
      const noise1 = cos(p.x.mul(13.1).sub(p.y.mul(7.4)).add(p.z.mul(11.6)).add(volumeClock.mul(-0.31)).add(volumeSeed.mul(1.7)));
      const noise2 = sin(p.x.mul(27.0).add(p.y.mul(21.0)).sub(p.z.mul(19.0)).add(volumeClock.mul(0.57)).add(volumeSeed.mul(2.3)));
      const fractalNoise = noise0.mul(0.52).add(noise1.mul(0.30)).add(noise2.mul(0.18)).mul(0.5).add(0.5);
      const haze = exp(distance.mul(-0.0009));
      const density = shape.mul(fractalNoise).mul(volumeOpacity).mul(haze).mul(0.095);
      accumulated.addAssign(density.mul(stepLength));
      sampleAt.addAssign(stepLength);
    });

    const scatter = accumulated.div(float(1).add(accumulated.mul(0.72)));
    const sunTerm = float(0.44).add(max(dot(normalize(direction), normalize(sunDirection)), float(0)).mul(0.56));
    const eventColour = vec3(1.0, 0.24, 0.045);
    const backgroundColour = vec3(0.42, 0.52, 0.56);
    const colour = mix(backgroundColour, eventColour, volumeMode.mul(0.72).add(eventFlash.mul(0.28)))
      .mul(scatter).mul(sunTerm);
    const alpha = clamp(scatter.mul(1.15), float(0), float(0.92));
    return vec4(colour, alpha);
  })();
  return material;
}

function createRingMaterial(
  ringClock: any,
  ringOpacity: any,
  ringRadius: any,
): MeshBasicNodeMaterial {
  const material = new MeshBasicNodeMaterial();
  material.transparent = true;
  material.depthWrite = false;
  material.depthTest = true;
  material.side = THREE.DoubleSide;
  material.blending = THREE.AdditiveBlending;
  material.fog = false;
  material.toneMapped = false;
  material.positionNode = positionLocal.mul(ringRadius);
  const grain = sin(positionLocal.x.mul(23).add(positionLocal.y.mul(31)).add(ringClock.mul(2.2)))
    .mul(0.5).add(0.5);
  material.colorNode = vec4(vec3(1.0, 0.31, 0.06), ringOpacity.mul(float(0.48).add(grain.mul(0.52))));
  return material;
}

/**
 * Nuke Town's persistent horizon cloud and deterministic match-end event.
 * The scene owns one shared volume graph and one ring graph; background/event
 * meshes are draw instances whose origins, extents and mode are uniforms.
 */
export class NukeEventPresentation {
  readonly root: THREE.Group;
  private readonly backgroundVolume: THREE.Mesh;
  private readonly eventVolume: THREE.Mesh;
  private readonly shockwaveRing: THREE.Mesh;
  private readonly volumeOrigin = uniform(new THREE.Vector3());
  private readonly volumeHalfExtents = uniform(new THREE.Vector3());
  private readonly volumeMode = uniform(0);
  private readonly volumeClock = uniform(0);
  private readonly volumeSeed = uniform(0);
  private readonly volumeOpacity = uniform(1);
  private readonly eventFlash = uniform(0);
  private readonly eventGrowth = uniform(0);
  private readonly eventFade = uniform(0);
  private readonly ringClock = uniform(0);
  private readonly ringOpacity = uniform(0);
  private readonly ringRadius = uniform(0);
  private readonly sunDirection = uniform(new THREE.Vector3(0.22, 0.86, 0.34).normalize());
  private readonly timeline: NukeEventTimeline = { phase: 'idle', elapsedSeconds: 0, flashStrength: 0, fireballStrength: 0, growth: 0, ringProgress: 0, fade: 0, active: false };
  private readonly onDetonation: ((triggerAtHostTimeMs: number, seed: number) => void) | undefined;
  private _eventTriggerAtHostTimeMs: number | null = null;
  private eventSeed = 0;
  private arenaActive = false;
  private prewarmed = false;
  private _lightingStep = 0;
  private _exposureScale = 1;
  private _fogTintR = 1;
  private _fogTintG = 1;
  private _fogTintB = 1;

  constructor(scene: THREE.Scene, options: NukeEventPresentationOptions = {}) {
    this.onDetonation = options.onDetonation;
    if (options.sunDirection) setVector(this.sunDirection.value, options.sunDirection);
    this.sunDirection.value.normalize();

    this.root = new THREE.Group();
    this.root.name = 'nuketown2-nuke-event-presentation';
    this.root.matrixAutoUpdate = false;
    this.root.userData.presentationOnly = true;
    this.root.userData.nukeEvent = true;
    this.root.userData.pipelineIds = NUKE_EVENT_PIPELINE_IDS;

    const volumeMaterial = createVolumeMaterial(
      this.volumeOrigin,
      this.volumeHalfExtents,
      this.volumeMode,
      this.volumeClock,
      this.volumeSeed,
      this.volumeOpacity,
      this.eventFlash,
      this.eventGrowth,
      this.eventFade,
      this.sunDirection,
    );
    const volumeGeometry = new THREE.BoxGeometry(2, 2, 2);
    this.backgroundVolume = new THREE.Mesh(volumeGeometry, volumeMaterial);
    this.backgroundVolume.name = 'nuketown2-horizon-mushroom-cloud';
    this.backgroundVolume.position.set(...BACKGROUND_CLOUD_ORIGIN);
    this.backgroundVolume.scale.set(...BACKGROUND_CLOUD_HALF_EXTENTS);
    this.backgroundVolume.frustumCulled = false;
    this.backgroundVolume.renderOrder = 4;
    this.backgroundVolume.userData.presentationOnly = true;
    this.backgroundVolume.userData.uniformInstance = 'background-origin-extents-mode';
    this.backgroundVolume.onBeforeRender = () => this.bindBackgroundUniforms();

    this.eventVolume = new THREE.Mesh(volumeGeometry, volumeMaterial);
    this.eventVolume.name = 'nuketown2-detonation-mushroom-cloud';
    this.eventVolume.position.set(...EVENT_VOLUME_ORIGIN);
    this.eventVolume.scale.set(...EVENT_VOLUME_HALF_EXTENTS);
    this.eventVolume.frustumCulled = false;
    this.eventVolume.renderOrder = 5;
    this.eventVolume.visible = false;
    this.eventVolume.userData.presentationOnly = true;
    this.eventVolume.userData.uniformInstance = 'event-origin-extents-mode';
    this.eventVolume.onBeforeRender = () => this.bindEventUniforms();

    const ringGeometry = new THREE.RingGeometry(0.86, 1, 64);
    const ringMaterial = createRingMaterial(this.ringClock, this.ringOpacity, this.ringRadius);
    this.shockwaveRing = new THREE.Mesh(ringGeometry, ringMaterial);
    this.shockwaveRing.name = 'nuketown2-detonation-shockwave-ring';
    this.shockwaveRing.position.set(...RING_ORIGIN);
    this.shockwaveRing.rotation.x = -Math.PI / 2;
    this.shockwaveRing.frustumCulled = false;
    this.shockwaveRing.renderOrder = 6;
    this.shockwaveRing.visible = false;
    this.shockwaveRing.userData.presentationOnly = true;
    this.shockwaveRing.userData.uniformInstance = 'ring-radius-opacity-clock';
    this.shockwaveRing.onBeforeRender = () => this.bindRingUniforms();

    this.root.add(this.backgroundVolume, this.eventVolume, this.shockwaveRing);
    scene.add(this.root);
    if (options.backend !== 'webgpu') this.root.userData.backendWarning = 'native-WebGPU required for TSL lane';
  }

  get lightingStep(): number { return this._lightingStep; }
  get exposureScale(): number { return this._exposureScale; }
  get fogTintR(): number { return this._fogTintR; }
  get fogTintG(): number { return this._fogTintG; }
  get fogTintB(): number { return this._fogTintB; }
  get eventTriggerAtHostTimeMs(): number | null { return this._eventTriggerAtHostTimeMs; }

  setArenaActive(active: boolean): void {
    this.arenaActive = active;
    this.root.visible = active;
  }

  setSunDirection(x: number, y: number, z: number): void {
    this.sunDirection.value.set(x, y, z).normalize();
  }

  resetForMatch(): void {
    this._eventTriggerAtHostTimeMs = null;
    this.eventSeed = 0;
    writeNukeEventTimeline(this.timeline, null, 0);
    this.eventVolume.visible = false;
    this.shockwaveRing.visible = false;
    this._lightingStep = 0;
    this._exposureScale = 1;
    this._fogTintR = 1;
    this._fogTintG = 1;
    this._fogTintB = 1;
  }

  /** Networked admission: no local timestamp is generated here. */
  triggerFromMatchEnd(selectedArenaId: string, replicatedState: ReplicatedMatchEndState | null | undefined): boolean {
    const triggerAtHostTimeMs = deriveNukeEventTriggerFromReplicatedState(selectedArenaId, replicatedState);
    if (triggerAtHostTimeMs === null || this._eventTriggerAtHostTimeMs === triggerAtHostTimeMs) return false;
    this._eventTriggerAtHostTimeMs = triggerAtHostTimeMs;
    this.eventSeed = nukeEventSeed(triggerAtHostTimeMs);
    this.onDetonation?.(triggerAtHostTimeMs, this.eventSeed);
    return true;
  }

  /** Explicit QA-only trigger; it is not used by multiplayer authority. */
  debugTrigger(triggerAtHostTimeMs: number): boolean {
    if (!Number.isFinite(triggerAtHostTimeMs) || triggerAtHostTimeMs < 0) return false;
    this._eventTriggerAtHostTimeMs = triggerAtHostTimeMs;
    this.eventSeed = nukeEventSeed(triggerAtHostTimeMs);
    this.onDetonation?.(triggerAtHostTimeMs, this.eventSeed);
    return true;
  }

  update(nowHostTimeMs: number): void {
    this.volumeClock.value = nowHostTimeMs / 1_000;
    this.ringClock.value = nowHostTimeMs / 1_000;
    writeNukeEventTimeline(this.timeline, this._eventTriggerAtHostTimeMs, nowHostTimeMs);
    this.eventFlash.value = this.timeline.flashStrength;
    this.eventGrowth.value = this.timeline.growth;
    this.eventFade.value = this.timeline.fade;
    this.volumeSeed.value = (this.eventSeed % 10_000) / 1_000;
    this.eventVolume.visible = this.arenaActive && this.timeline.active;
    this.shockwaveRing.visible = this.arenaActive && this.timeline.active;
    this.ringRadius.value = 3 + this.timeline.ringProgress * 68;
    this.ringOpacity.value = this.timeline.fade * Math.min(1, this.timeline.elapsedSeconds / 0.8);
    this._exposureScale = 1 + this.timeline.flashStrength * 0.32 + this.timeline.fireballStrength * 0.06;
    const orangeDrift = this.timeline.active ? this.timeline.fade * 0.3 : 0;
    this._fogTintR = 1;
    this._fogTintG = 1 - orangeDrift * 0.28;
    this._fogTintB = 1 - orangeDrift * 0.58;
    this._lightingStep = this.timeline.active ? Math.floor(this.timeline.elapsedSeconds * 8) + 1 : 0;
  }

  async prewarm(runtime: PresentationPrewarmRuntime, camera: THREE.Camera, scene: THREE.Scene): Promise<void> {
    if (this.prewarmed || runtime.backend !== 'webgpu') return;
    const rootVisible = this.root.visible;
    const backgroundVisible = this.backgroundVolume.visible;
    const eventVisible = this.eventVolume.visible;
    const ringVisible = this.shockwaveRing.visible;
    this.root.visible = true;
    this.backgroundVolume.visible = true;
    this.eventVolume.visible = true;
    this.shockwaveRing.visible = true;
    try {
      await runtime.compileAndRender(this.root, camera, scene);
      this.prewarmed = true;
    } finally {
      this.root.visible = rootVisible;
      this.backgroundVolume.visible = backgroundVisible;
      this.eventVolume.visible = eventVisible;
      this.shockwaveRing.visible = ringVisible;
    }
  }

  telemetry(): Record<string, unknown> {
    return {
      arenaActive: this.arenaActive,
      triggerAtHostTimeMs: this._eventTriggerAtHostTimeMs,
      phase: this.timeline.phase,
      elapsedSeconds: Number(this.timeline.elapsedSeconds.toFixed(3)),
      pipelines: NUKE_EVENT_PIPELINE_IDS,
      raySteps: NUKE_EVENT_RAY_STEPS,
      backgroundDistanceM: NUKE_EVENT_BACKGROUND_DISTANCE_M,
      budgetP50Ms: NUKE_EVENT_BACKGROUND_BUDGET_P50_MS,
      cameraFarM: NUKE_EVENT_CAMERA_FAR_M,
    };
  }

  private bindBackgroundUniforms(): void {
    this.volumeMode.value = 0;
    this.volumeOpacity.value = 0.34;
    this.volumeOrigin.value.set(...BACKGROUND_CLOUD_ORIGIN);
    this.volumeHalfExtents.value.set(...BACKGROUND_CLOUD_HALF_EXTENTS);
  }

  private bindEventUniforms(): void {
    this.volumeMode.value = 1;
    this.volumeOpacity.value = 1;
    this.volumeOrigin.value.set(...EVENT_VOLUME_ORIGIN);
    this.volumeHalfExtents.value.set(...EVENT_VOLUME_HALF_EXTENTS);
  }

  private bindRingUniforms(): void {
    // The ring values are already uniforms; this hook marks the instance as a
    // separate draw without introducing a second node graph or attributes.
  }
}
