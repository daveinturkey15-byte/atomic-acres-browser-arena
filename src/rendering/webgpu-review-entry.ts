import * as THREE from 'three';
import type { ArenaId } from '../map-selection';
import type { ArenaReviewCamera, ArenaVisualDefinition } from './arena-visual-definition';
import {
  ArenaVisualStreamController,
  loadArenaVisualModule,
  type ArenaVisualSwitchReceipt,
} from './arena-visual-stream';
import { WebGpuRenderRuntime, type RenderRuntimeRequest, type RenderRuntimeTelemetry } from './render-runtime';
import {
  assertTslReviewAuthored,
  tslDescriptorSha256,
  TSL_MIGRATION_INVENTORY,
} from './tsl-migration-inventory';
import {
  assertRuntimeTslTraversal,
  auditRuntimeTslTraversal,
  createPass64TslSceneSystems,
  type Pass64TslSceneSystems,
  type RuntimeTslTraversal,
} from './pass64-tsl-scene';

const REVIEW_ARENAS: readonly Readonly<{ id: ArenaId; label: string }>[] = Object.freeze([
  Object.freeze({ id: 'atomic-acres', label: 'Nuke Town' }),
  Object.freeze({ id: 'skyline-terminal', label: 'Terminal' }),
  Object.freeze({ id: 'rustworks-1v1', label: 'RustRig' }),
  Object.freeze({ id: 'gun-range', label: 'Gun Range' }),
]);

const REVIEW_CONTRAST_KEYS: Readonly<Record<ArenaId, readonly Readonly<{
  position: readonly [number, number, number];
  target: readonly [number, number, number];
  color: number;
  intensity: number;
  distance: number;
}>[]>> = Object.freeze({
  'atomic-acres': Object.freeze([
    Object.freeze({ position: [-26, 11, 12], target: [-18, 1.8, 2], color: 0xffc981, intensity: 13, distance: 32 }),
    Object.freeze({ position: [26, 10, -12], target: [18, 1.8, -2], color: 0xa9d8ff, intensity: 11, distance: 31 }),
  ]),
  'skyline-terminal': Object.freeze([
    Object.freeze({ position: [0, 4.8, 2], target: [12, 5.4, 2], color: 0xd9f4ff, intensity: 18, distance: 30 }),
    Object.freeze({ position: [-20, 6.7, -30], target: [-8, 0.8, -19], color: 0xffc68a, intensity: 17, distance: 34 }),
  ]),
  'rustworks-1v1': Object.freeze([]),
  'gun-range': Object.freeze([]),
});

export type WebGpuReviewProof = Readonly<{
  schemaVersion: 1;
  mode: 'pass64-webgpu-tsl-hitl-review';
  gameplayAuthority: 'inspection-only-no-gameplay-or-network-authority';
  runtime: RenderRuntimeTelemetry;
  arena: ArenaVisualSwitchReceipt;
  arenaDefinitionId: ArenaId;
  arenaModuleId: string;
  activeCameraId: string;
  fixedTimeMs: number;
  traversal: RuntimeTslTraversal;
  descriptorHashes: Readonly<Record<string, string>>;
  bloom: 'disabled-pending-depth-aware-emissive-mrt-proof';
  releasePromotion: 'blocked-until-visual-parity-and-budget-gates-are-attested';
}>;

type ReviewDebugWindow = Window & Readonly<{
  __ATOMIC_ACRES_WEBGPU_DEBUG__?: Readonly<{
    snapshot(): WebGpuReviewProof;
    selectCamera(cameraId: string): WebGpuReviewProof;
  }>;
}>;

function selectedArenaId(search: string): ArenaId {
  const requested = new URLSearchParams(search).get('map');
  return REVIEW_ARENAS.some((arena) => arena.id === requested) ? requested as ArenaId : 'atomic-acres';
}

function createReviewShell(): Readonly<{
  canvas: HTMLCanvasElement;
  arenaSelect: HTMLSelectElement;
  cameraSelect: HTMLSelectElement;
  status: HTMLElement;
  proof: HTMLElement;
}> {
  const app = document.querySelector<HTMLDivElement>('#app');
  if (!app) throw new Error('Missing #app root');
  app.innerHTML = `
    <canvas id="game" aria-label="Pass 64 WebGPU and TSL arena review"></canvas>
    <aside id="webgpu-review" aria-label="Pass 64 renderer review controls">
      <small>PASS 64 · HARDWARE WEBGPU / TSL</small>
      <strong>VISUAL FORGE REVIEW</strong>
      <p>Inspection-only render path. Gameplay and network authority are deliberately disconnected.</p>
      <label>ARENA · RELOAD<select id="webgpu-review-arena">${REVIEW_ARENAS.map((arena) => `<option value="${arena.id}">${arena.label}</option>`).join('')}</select></label>
      <label>DETERMINISTIC CAMERA<select id="webgpu-review-camera"></select></label>
      <output id="webgpu-review-status">INITIALIZING HARDWARE ADAPTER</output>
      <code id="webgpu-review-proof"></code>
    </aside>
  `;
  const canvas = app.querySelector<HTMLCanvasElement>('#game');
  const arenaSelect = app.querySelector<HTMLSelectElement>('#webgpu-review-arena');
  const cameraSelect = app.querySelector<HTMLSelectElement>('#webgpu-review-camera');
  const status = app.querySelector<HTMLElement>('#webgpu-review-status');
  const proof = app.querySelector<HTMLElement>('#webgpu-review-proof');
  if (!canvas || !arenaSelect || !cameraSelect || !status || !proof) throw new Error('Incomplete WebGPU review shell');
  return { canvas, arenaSelect, cameraSelect, status, proof };
}

function setCamera(camera: THREE.PerspectiveCamera, review: ArenaReviewCamera): void {
  camera.fov = review.fov;
  camera.near = review.near;
  camera.far = review.far;
  camera.position.fromArray(review.position);
  camera.lookAt(new THREE.Vector3().fromArray(review.target));
  camera.updateProjectionMatrix();
}

function createLighting(definition: ArenaVisualDefinition): THREE.Group {
  const root = new THREE.Group();
  root.name = `${definition.displayLabel} review lighting`;
  const ambient = new THREE.HemisphereLight(definition.lighting.ambientColor, 0x172126, definition.lighting.ambientIntensity);
  const sun = new THREE.DirectionalLight(definition.lighting.sunColor, definition.lighting.sunIntensity);
  sun.position.set(42, 62, 26);
  sun.castShadow = definition.shadows.enabled;
  sun.shadow.mapSize.setScalar(definition.shadows.mapSize);
  sun.shadow.camera.left = -definition.shadows.maximumDistance * 0.5;
  sun.shadow.camera.right = definition.shadows.maximumDistance * 0.5;
  sun.shadow.camera.top = definition.shadows.maximumDistance * 0.5;
  sun.shadow.camera.bottom = -definition.shadows.maximumDistance * 0.5;
  sun.shadow.camera.near = 1;
  sun.shadow.camera.far = definition.shadows.maximumDistance;
  sun.shadow.normalBias = definition.shadows.normalBias;
  root.add(ambient, sun, sun.target);
  for (const [index, spec] of REVIEW_CONTRAST_KEYS[definition.id].entries()) {
    const key = new THREE.SpotLight(spec.color, spec.intensity, spec.distance, 0.62, 0.7, 2);
    key.name = `${definition.id}-webgpu-contrast-key-${index + 1}`;
    key.position.fromArray(spec.position);
    key.castShadow = true;
    key.shadow.mapSize.set(256, 256);
    key.shadow.camera.near = 0.5;
    key.shadow.camera.far = spec.distance;
    key.shadow.bias = -0.00022;
    key.shadow.normalBias = definition.shadows.normalBias;
    key.shadow.radius = 1.5;
    const target = new THREE.Object3D();
    target.name = `${key.name}-target`;
    target.position.fromArray(spec.target);
    key.target = target;
    root.add(key, target);
  }
  return root;
}

function disposeLighting(root: THREE.Group | null): void {
  root?.traverse((node) => {
    if (node instanceof THREE.DirectionalLight || node instanceof THREE.SpotLight) node.shadow.map?.dispose();
  });
  root?.removeFromParent();
  root?.clear();
}

function updateCameraOptions(select: HTMLSelectElement, definition: ArenaVisualDefinition, selectedId: string): void {
  select.innerHTML = definition.reviewCameras
    .map((camera) => `<option value="${camera.id}">${camera.id} · ${camera.purpose}</option>`)
    .join('');
  select.value = selectedId;
}

export async function startWebGpuReview(request: RenderRuntimeRequest): Promise<void> {
  if (request.requestedBackend !== 'webgpu' || !request.requireWebGPU) {
    throw new Error('Pass 64 WebGPU review requires ?renderer=webgpu&requireWebGPU=1');
  }
  assertTslReviewAuthored();
  const shell = createReviewShell();
  const runtime = await WebGpuRenderRuntime.create({
    canvas: shell.canvas,
    antialias: true,
    samples: 4,
    requireWebGPU: true,
  });
  runtime.assertHardwareReady();
  document.documentElement.dataset.renderBackend = 'webgpu';
  document.documentElement.dataset.renderReview = 'pass64-tsl';
  runtime.renderer.outputColorSpace = THREE.SRGBColorSpace;
  runtime.renderer.toneMapping = THREE.ACESFilmicToneMapping;
  runtime.renderer.shadowMap.enabled = true;
  runtime.renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 2));
  const scene = new THREE.Scene();
  const camera = new THREE.PerspectiveCamera(64, 1, 0.1, 500);
  const stream = new ArenaVisualStreamController(scene);
  const descriptorHashes = Object.freeze(Object.fromEntries(await Promise.all(
    TSL_MIGRATION_INVENTORY.map(async (entry) => [entry.replacementPipelineId, await tslDescriptorSha256(entry)] as const),
  )));
  let definition: ArenaVisualDefinition;
  let arenaReceipt: ArenaVisualSwitchReceipt;
  let systems: Pass64TslSceneSystems | null = null;
  let lighting: THREE.Group | null = null;
  let traversal: RuntimeTslTraversal;
  let activeCamera: ArenaReviewCamera;
  let proof: WebGpuReviewProof;
  let frameHandle = 0;
  let lastFpsAt = performance.now();
  let frameCount = 0;
  let fps = 0;
  let switching = false;

  const resize = (): void => {
    const width = Math.max(1, window.innerWidth);
    const height = Math.max(1, window.innerHeight);
    runtime.renderer.setSize(width, height, false);
    camera.aspect = width / height;
    camera.updateProjectionMatrix();
  };
  resize();
  window.addEventListener('resize', resize);

  const publishProof = (): WebGpuReviewProof => {
    const telemetry = runtime.telemetry('webgpu');
    if (telemetry.deviceLost) throw new Error('Pass 64 WebGPU review stopped because the GPU device was lost');
    proof = Object.freeze({
      schemaVersion: 1,
      mode: 'pass64-webgpu-tsl-hitl-review',
      gameplayAuthority: 'inspection-only-no-gameplay-or-network-authority',
      runtime: telemetry,
      arena: arenaReceipt,
      arenaDefinitionId: definition.id,
      arenaModuleId: definition.moduleId,
      activeCameraId: activeCamera.id,
      fixedTimeMs: activeCamera.fixedTimeMs,
      traversal,
      descriptorHashes,
      bloom: 'disabled-pending-depth-aware-emissive-mrt-proof',
      releasePromotion: 'blocked-until-visual-parity-and-budget-gates-are-attested',
    });
    shell.status.textContent = `${definition.displayLabel.toUpperCase()} · ${activeCamera.purpose.toUpperCase()} · ${fps} FPS`;
    shell.proof.textContent = `ACTUAL ${telemetry.actualBackend.toUpperCase()} · ${traversal.compiledPipelineIds.length}/7 TSL · 0 GLSL`;
    return proof;
  };

  const activateArena = async (arenaId: ArenaId): Promise<WebGpuReviewProof> => {
    switching = true;
    let completed = false;
    shell.arenaSelect.disabled = true;
    shell.cameraSelect.disabled = true;
    shell.status.textContent = `STREAMING ${arenaId.toUpperCase()}`;
    try {
      await runtime.waitForSubmittedWork();
      const module = await loadArenaVisualModule(arenaId);
      const nextReceipt = await stream.switchTo(arenaId);
      systems?.dispose();
      disposeLighting(lighting);
      definition = module.definition;
      arenaReceipt = nextReceipt;
      scene.background = new THREE.Color(definition.fog.color);
      scene.fog = new THREE.Fog(definition.fog.color, definition.fog.near, definition.fog.far);
      runtime.renderer.toneMappingExposure = definition.colorPipeline.exposure;
      lighting = createLighting(definition);
      scene.add(lighting);
      activeCamera = definition.reviewCameras[0];
      setCamera(camera, activeCamera);
      updateCameraOptions(shell.cameraSelect, definition, activeCamera.id);
      systems = createPass64TslSceneSystems(scene, camera, runtime.renderPipeline, definition);
      await runtime.renderer.compileAsync(scene, camera);
      runtime.renderPipeline.render();
      const previousTarget = runtime.renderer.getRenderTarget();
      runtime.renderer.setRenderTarget(systems.principalHdrTarget);
      try {
        await runtime.renderer.compileAsync(scene, camera);
      } finally {
        runtime.renderer.setRenderTarget(previousTarget);
      }
      runtime.renderPipeline.render();
      await runtime.waitForSubmittedWork();
      runtime.setRenderTargetTelemetry(systems.principalHdrTarget.samples, 0);
      traversal = auditRuntimeTslTraversal(scene, systems.compiledPipelineIds);
      assertRuntimeTslTraversal(traversal);
      shell.arenaSelect.value = arenaId;
      const nextUrl = new URL(window.location.href);
      nextUrl.searchParams.set('map', arenaId);
      window.history.replaceState(null, '', nextUrl);
      completed = true;
      return publishProof();
    } finally {
      if (completed) switching = false;
      shell.arenaSelect.disabled = false;
      shell.cameraSelect.disabled = false;
    }
  };

  const selectCamera = (cameraId: string): WebGpuReviewProof => {
    const next = definition.reviewCameras.find((entry) => entry.id === cameraId);
    if (!next) throw new Error(`Unknown deterministic review camera ${cameraId}`);
    activeCamera = next;
    setCamera(camera, next);
    shell.cameraSelect.value = next.id;
    return publishProof();
  };

  await activateArena(selectedArenaId(window.location.search));
  shell.arenaSelect.addEventListener('change', () => {
    const nextUrl = new URL(window.location.href);
    nextUrl.searchParams.set('map', shell.arenaSelect.value);
    window.location.assign(nextUrl);
  });
  shell.cameraSelect.addEventListener('change', () => { selectCamera(shell.cameraSelect.value); });

  const debug = Object.freeze({
    snapshot: () => proof,
    selectCamera,
  });
  (window as unknown as ReviewDebugWindow & { __ATOMIC_ACRES_WEBGPU_DEBUG__: typeof debug }).__ATOMIC_ACRES_WEBGPU_DEBUG__ = debug;

  const frame = (now: number): void => {
    frameCount += 1;
    if (now - lastFpsAt >= 500) {
      fps = Math.round(frameCount * 1000 / (now - lastFpsAt));
      frameCount = 0;
      lastFpsAt = now;
      publishProof();
    }
    if (!switching) runtime.renderPipeline.render();
    frameHandle = requestAnimationFrame(frame);
  };
  frameHandle = requestAnimationFrame(frame);
  window.addEventListener('pagehide', () => {
    cancelAnimationFrame(frameHandle);
    window.removeEventListener('resize', resize);
    systems?.dispose();
    disposeLighting(lighting);
    stream.dispose();
    runtime.dispose();
  }, { once: true });
}
