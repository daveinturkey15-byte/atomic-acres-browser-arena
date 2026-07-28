import * as THREE from 'three';
import { GLTFLoader } from 'three/examples/jsm/loaders/GLTFLoader.js';

export const AZURE_COIL_ASSET = '/assets/original/models/azure-coil-leviathan.glb';
export const AZURE_COIL_SWIM_CLIP = 'AzureCoil_Swim';

export const AZURE_COIL_PATROL = Object.freeze({
  centreX: 0,
  centreZ: 0,
  altitude: 11,
  radiusX: 23,
  radiusZ: 26,
  bobAmplitude: 0.9,
  periodMs: 24_000,
  scale: 1.05,
  minimumVisualClearanceY: 10.1,
  maximumVisualAltitudeY: 11.9,
});

export const AZURE_COIL_AUTHORITY = Object.freeze({
  presentationOnly: true,
  blocksShots: false,
  hasRapierCollider: false,
  hasBallisticSurface: false,
  networkReplicated: false,
});

export interface AzureCoilPatrolSample {
  readonly phase: number;
  readonly x: number;
  readonly y: number;
  readonly z: number;
  readonly yaw: number;
  readonly pitch: number;
  readonly roll: number;
}

export interface AzureCoilTelemetry {
  readonly asset: string;
  readonly state: 'ready' | 'disposed';
  readonly visible: boolean;
  readonly activeArenaId: string;
  readonly clip: string;
  readonly clips: readonly string[];
  readonly animationTimeSeconds: number;
  readonly runtimeScale: number;
  readonly meshes: number;
  readonly skinnedMeshes: number;
  readonly bones: number;
  readonly materialGroups: number;
  readonly lastSample: AzureCoilPatrolSample;
  readonly authority: typeof AZURE_COIL_AUTHORITY;
}

function wrappedProgress(elapsedMs: number): number {
  if (!Number.isFinite(elapsedMs)) return 0;
  const wrapped = ((elapsedMs % AZURE_COIL_PATROL.periodMs) + AZURE_COIL_PATROL.periodMs)
    % AZURE_COIL_PATROL.periodMs;
  return wrapped / AZURE_COIL_PATROL.periodMs;
}

/**
 * Pure deterministic patrol state. The authored animation controls local swim
 * deformation; this sample controls only presentation-root placement.
 */
export function azureCoilPatrolSample(elapsedMs: number): AzureCoilPatrolSample {
  const phase = wrappedProgress(elapsedMs) * Math.PI * 2;
  const doublePhase = phase * 2 - 0.38;
  const x = AZURE_COIL_PATROL.centreX + Math.sin(phase) * AZURE_COIL_PATROL.radiusX;
  const y = AZURE_COIL_PATROL.altitude + Math.sin(doublePhase) * AZURE_COIL_PATROL.bobAmplitude;
  const z = AZURE_COIL_PATROL.centreZ + Math.cos(phase) * AZURE_COIL_PATROL.radiusZ;
  const velocityX = Math.cos(phase) * AZURE_COIL_PATROL.radiusX;
  const velocityY = Math.cos(doublePhase) * AZURE_COIL_PATROL.bobAmplitude * 2;
  const velocityZ = -Math.sin(phase) * AZURE_COIL_PATROL.radiusZ;
  const horizontalSpeed = Math.hypot(velocityX, velocityZ);
  return Object.freeze({
    phase,
    x,
    y,
    z,
    // The GLB's head is exported toward local -Z, matching Three's forward axis.
    yaw: Math.atan2(-velocityX, -velocityZ),
    pitch: Math.atan2(velocityY, horizontalSpeed),
    roll: -0.11 * Math.sin(phase),
  });
}

function disposeObjectResources(root: THREE.Object3D): void {
  const geometries = new Set<THREE.BufferGeometry>();
  const materials = new Set<THREE.Material>();
  const textures = new Set<THREE.Texture>();
  root.traverse((node) => {
    if (!(node instanceof THREE.Mesh)) return;
    geometries.add(node.geometry);
    const nodeMaterials = Array.isArray(node.material) ? node.material : [node.material];
    for (const material of nodeMaterials) {
      materials.add(material);
      const materialRecord = material as THREE.Material & Record<string, unknown>;
      for (const key of [
        'map', 'normalMap', 'roughnessMap', 'metalnessMap', 'aoMap',
        'emissiveMap', 'alphaMap', 'transmissionMap', 'thicknessMap',
      ]) {
        const texture = materialRecord[key];
        if (texture instanceof THREE.Texture) textures.add(texture);
      }
    }
  });
  for (const geometry of geometries) geometry.dispose();
  for (const material of materials) material.dispose();
  for (const texture of textures) texture.dispose();
}

export class AzureCoilPresentation {
  readonly root: THREE.Group;
  private readonly mixer: THREE.AnimationMixer;
  private readonly action: THREE.AnimationAction;
  private readonly clips: readonly string[];
  private readonly meshCount: number;
  private readonly skinnedMeshCount: number;
  private readonly boneCount: number;
  private readonly materialGroupCount: number;
  private activeArenaId = 'atomic-acres';
  private disposed = false;
  private lastNowMs: number | null = null;
  private lastSample = azureCoilPatrolSample(0);

  constructor(root: THREE.Group, animations: readonly THREE.AnimationClip[]) {
    this.root = root;
    this.root.name = 'azure-coil-leviathan-presentation';
    this.root.scale.setScalar(AZURE_COIL_PATROL.scale);
    this.root.userData.azureCoil = true;
    this.root.userData.asset = AZURE_COIL_ASSET;
    this.root.userData.authority = AZURE_COIL_AUTHORITY;
    this.root.userData.presentationOnly = true;
    this.root.userData.blocksShots = false;
    this.root.userData.hasRapierCollider = false;
    this.root.userData.hasBallisticSurface = false;
    this.root.userData.networkReplicated = false;

    let meshes = 0;
    let skinnedMeshes = 0;
    let bones = 0;
    let materialGroups = 0;
    this.root.traverse((node) => {
      node.userData.presentationOnly = true;
      node.userData.blocksShots = false;
      node.raycast = () => undefined;
      if (node instanceof THREE.Bone) bones += 1;
      if (!(node instanceof THREE.Mesh)) return;
      meshes += 1;
      if (node instanceof THREE.SkinnedMesh) skinnedMeshes += 1;
      materialGroups += Array.isArray(node.material) ? node.material.length : 1;
      node.castShadow = false;
      node.receiveShadow = false;
      node.frustumCulled = true;
    });
    this.meshCount = meshes;
    this.skinnedMeshCount = skinnedMeshes;
    this.boneCount = bones;
    this.materialGroupCount = materialGroups;
    const animationList = [...animations];
    this.clips = Object.freeze(animationList.map((clip) => clip.name));

    const swimClip = THREE.AnimationClip.findByName(animationList, AZURE_COIL_SWIM_CLIP);
    if (!swimClip) {
      throw new Error(`Azure Coil GLB is missing ${AZURE_COIL_SWIM_CLIP}; found [${this.clips.join(', ')}]`);
    }
    this.mixer = new THREE.AnimationMixer(this.root);
    this.action = this.mixer.clipAction(swimClip);
    this.action.setLoop(THREE.LoopRepeat, Infinity);
    this.action.clampWhenFinished = false;
    this.action.enabled = true;
    this.action.play();
    this.applySample(this.lastSample);
  }

  private applySample(sample: AzureCoilPatrolSample): void {
    this.root.position.set(sample.x, sample.y, sample.z);
    this.root.rotation.set(sample.pitch, sample.yaw, sample.roll, 'YXZ');
  }

  setArena(arenaId: string): void {
    this.activeArenaId = arenaId;
    this.root.visible = !this.disposed && arenaId === 'atomic-acres';
    this.lastNowMs = null;
  }

  update(nowMs: number): void {
    if (this.disposed) return;
    const previous = this.lastNowMs;
    this.lastNowMs = nowMs;
    if (!this.root.visible) return;
    const deltaSeconds = previous === null ? 0 : THREE.MathUtils.clamp((nowMs - previous) / 1_000, 0, 0.05);
    this.mixer.update(deltaSeconds);
    this.lastSample = azureCoilPatrolSample(nowMs);
    this.applySample(this.lastSample);
  }

  dispose(): void {
    if (this.disposed) return;
    this.disposed = true;
    this.root.visible = false;
    this.mixer.stopAllAction();
    this.mixer.uncacheRoot(this.root);
    this.root.removeFromParent();
    disposeObjectResources(this.root);
    this.root.clear();
  }

  telemetry(): AzureCoilTelemetry {
    return Object.freeze({
      asset: AZURE_COIL_ASSET,
      state: this.disposed ? 'disposed' : 'ready',
      visible: this.root.visible,
      activeArenaId: this.activeArenaId,
      clip: AZURE_COIL_SWIM_CLIP,
      clips: this.clips,
      animationTimeSeconds: this.action.time,
      runtimeScale: AZURE_COIL_PATROL.scale,
      meshes: this.meshCount,
      skinnedMeshes: this.skinnedMeshCount,
      bones: this.boneCount,
      materialGroups: this.materialGroupCount,
      lastSample: this.lastSample,
      authority: AZURE_COIL_AUTHORITY,
    });
  }
}

export async function loadAzureCoilPresentation(
  scene: THREE.Scene,
  onProgress?: (loaded: number, total: number) => void,
): Promise<AzureCoilPresentation> {
  const loader = new GLTFLoader();
  const gltf = await loader.loadAsync(AZURE_COIL_ASSET, (event) => {
    onProgress?.(event.loaded, event.total);
  });
  const presentation = new AzureCoilPresentation(gltf.scene, gltf.animations);
  scene.add(presentation.root);
  return presentation;
}
